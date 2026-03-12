const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    try {
        const { cart, region, method } = JSON.parse(event.body);

        // 1. Get the "Official" math from your database logic
        // (You can reuse the exact logic from your calculate.js function here
        // to determine the final verified total)
        
        // 2. Create a Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'Store Purchase' },
                    unit_amount: Math.round(verifiedTotal * 100), // Stripe uses cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.URL}/success.html`,
            cancel_url: `${process.env.URL}/index.html`,
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url })
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
