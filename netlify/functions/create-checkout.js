const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    try {
        const { productIds, success_url } = JSON.parse(event.body);
        const qty = productIds.length;
        const subtotalCents = qty * 67;
        const totalCents = Math.round((subtotalCents + 30) / (1 - 0.029));

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: `Store Purchase (${qty} items)` },
                    unit_amount: totalCents, 
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: success_url,
            cancel_url: `${process.env.URL || 'http://localhost:8888'}/`,
            metadata: { productIds: JSON.stringify(productIds) }
        });

        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
