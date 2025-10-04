require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto'); // For generating session tokens

const app = express();
const PORT = process.env.PORT || 3009;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Important for parsing PayPal's form data

// Serve static files (your game)
app.use(express.static(path.join(__dirname, '.')));

// --- NEW: In-Memory Store for Active Game Sessions and Purchases ---
// In a real app, use Redis, a database, etc.
const gameSessions = new Map(); // Key: sessionToken, Value: { level: number, hasPurchasedContinue: boolean }

// --- NEW: Endpoint to generate a session token before redirecting to PayPal ---
app.post('/api/create-session', (req, res) => {
    const { level } = req.body; // The level the player died on

    if (!level) {
        return res.status(400).json({ error: 'Level is required' });
    }

    // Generate a unique, random session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    // Store the session with the level and mark continue as not purchased yet
    gameSessions.set(sessionToken, { level: parseInt(level, 10), hasPurchasedContinue: false });

    // Send the token back to the client
    res.json({ sessionToken });
});

// --- NEW: PayPal IPN Endpoint ---
// This is the URL you will configure in your PayPal button or account settings.
app.post('/api/paypal-ipn', async (req, res) => {
    console.log('Received IPN request');

    // Step 1: Read the raw POST data from PayPal
    let ipnData = req.body;

    // Step 2: Add the 'cmd' parameter for verification
    const verificationData = {
        ...ipnData,
        cmd: '_notify-validate'
    };

    try {
        // Step 3: Send the data back to PayPal for verification
        const verificationResponse = await fetch('https://ipnpb.paypal.com/cgi-bin/webscr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(verificationData).toString()
        });

        const verificationResult = await verificationResponse.text();

        if (verificationResult !== 'VERIFIED') {
            console.error('IPN Verification Failed:', verificationResult);
            return res.status(400).send('IPN Verification Failed');
        }

        // Step 4: IPN is verified. Now, check if it's a payment for our 'Continue' button.
        const {
            payment_status,
            mc_gross, // Payment amount
            mc_currency, // Payment currency
            custom, // This is where we'll pass our sessionToken
            txn_id // Transaction ID (useful for logging/avoiding duplicates)
        } = ipnData;

        console.log('Verified IPN Data:', { payment_status, mc_gross, mc_currency, custom, txn_id });

        // Check for successful payment
        if (payment_status !== 'Completed') {
            console.log('Payment not completed. Status:', payment_status);
            return res.status(200).send('Payment not completed');
        }

        // Check for correct amount and currency (adjust '1.99' to your actual price)
        if (mc_currency !== 'USD' || parseFloat(mc_gross) !== 1.99) {
            console.log('Invalid payment amount or currency');
            return res.status(200).send('Invalid payment amount or currency');
        }

        // Step 5: Validate the session token
        const sessionToken = custom; // 'custom' field from PayPal
        if (!sessionToken || !gameSessions.has(sessionToken)) {
            console.error('Invalid or missing session token');
            return res.status(400).send('Invalid session');
        }

        // Step 6: Grant the continue privilege
        const sessionData = gameSessions.get(sessionToken);
        sessionData.hasPurchasedContinue = true;
        gameSessions.set(sessionToken, sessionData); // Update the map

        console.log(`✅ Payment successful for session ${sessionToken}. Granted continue for level ${sessionData.level}.`);

        // Respond to PayPal with HTTP 200
        res.status(200).send('OK');

        // Note: Do NOT redirect here. PayPal expects a 200 OK response.
        // The user will be redirected by PayPal's return URL (set in your button or account).

    } catch (error) {
        console.error('IPN Processing Error:', error);
        res.status(500).send('Server Error');
    }
});

// --- NEW: Endpoint for the game to check if a continue was purchased ---
app.get('/api/check-continue/:token', (req, res) => {
    const { token } = req.params;

    if (!token || !gameSessions.has(token)) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = gameSessions.get(token);
    res.json({
        hasPurchasedContinue: sessionData.hasPurchasedContinue,
        level: sessionData.level
    });

    // Optional: Clean up the session after it's been checked to free memory
    // gameSessions.delete(token);
});

// --- Existing Endpoints ---
// Proxy endpoint for fetching high scores
app.get('/api/scores', async (req, res) => {
    try {
        const response = await fetch('https://pocketbase.deewhy.ovh/api/collections/high_scores/records?sort=-score', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`PocketBase API responded with status: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching scores:', error.message);
        res.status(500).json({ error: 'Failed to fetch high scores' });
    }
});

// Proxy endpoint for submitting a new high score
app.post('/api/scores', async (req, res) => {
    try {
        const { score, player_name, level } = req.body;

        if (!score || !player_name) {
            return res.status(400).json({ error: 'Score and player_name are required' });
        }

        const response = await fetch('https://pocketbase.deewhy.ovh/api/collections/high_scores/records', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.POCKETBASE_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                score,
                player_name,
                level: level || 1 // Default to level 1 if not provided
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('PocketBase error:', errorData);
            throw new Error(`PocketBase API responded with status: ${response.status}`);
        }

        const data = await response.json();
        res.status(201).json(data);
    } catch (error) {
        console.error('Error saving score:', error.message);
        res.status(500).json({ error: 'Failed to save high score' });
    }
});

// Catch-all route to serve the game HTML for any unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Space Invaders server running at http://localhost:${PORT}`);
});
