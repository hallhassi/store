const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    try {
        const { cart, success_url } = JSON.parse(event.body);
        const productIds = Object.keys(cart);
        const metadataIds = productIds.join(',');

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: `Store Purchase (${productIds.length} items)` },
                    unit_amount: Math.round(((productIds.length * 67) + 30) / (1 - 0.029)), 
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: success_url,
            cancel_url: `${process.env.URL || 'http://localhost:8888'}/`,
            metadata: { 
                productIds: metadataIds // Used for 'sold' status
            }
        });

        return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
