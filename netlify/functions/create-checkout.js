const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
    try {
        const { cart, method } = JSON.parse(event.body);
        
        const FLAT_PRICE = 0.67;
        const itemCount = Object.keys(cart).length;
        const subtotal = itemCount * FLAT_PRICE;

        // --- Payment Processing Fee Logic ---
        let finalTotal = subtotal;
        if (method === 'card') finalTotal = (subtotal + 0.30) / (1 - 0.029);
        if (method === 'paypal') finalTotal = (subtotal + 0.49) / (1 - 0.044);
        
        const roundedTotal = parseFloat(finalTotal.toFixed(2));

        // PayPal Response for Frontend SDK
        if (method === 'paypal') {
            return {
                statusCode: 200,
                body: JSON.stringify({ 
                    total: roundedTotal,
                    status: 'ready' 
                })
            };
        }

        // --- Stripe Session Creation ---
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            metadata: {
                order_details: Object.entries(cart)
                    .map(([id, item]) => `${id}:${item.qty}`)
                    .join(',')
            },
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { 
                        name: `Order: ${itemCount} item(s)`,
                        description: 'Digital Download'
                    },
                    unit_amount: Math.round(roundedTotal * 100), // Stripe expects cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.URL}/?session=success`, 
            cancel_url: `${process.env.URL}/`,
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url })
        };

    } catch (err) {
        console.error("Checkout Error:", err.message);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: err.message }) 
        };
    }
};
