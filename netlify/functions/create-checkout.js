const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405 };

    try {
        const { cart } = JSON.parse(event.body);
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. Fetch current prices from Supabase to verify totals
        const { data: allProducts, error } = await supabase
            .from('products')
            .select('id, price, title')
            .in('id', Object.keys(cart));

        if (error || !allProducts) throw new Error("Could not verify products");

        // 2. Calculate Subtotal (Server-side validation)
        let subtotal = 0;
        allProducts.forEach(product => {
            const qty = cart[product.id].qty || 1;
            subtotal += parseFloat(product.price) * qty;
        });

        // 3. Apply Stripe Fee Math to match Frontend
        // Formula: (subtotal + 0.30) / (1 - 0.029)
        const finalTotalInCents = Math.round(((subtotal + 0.30) / (1 - 0.029)) * 100);

        // 4. Create Stripe Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { 
                        name: `Order: ${allProducts.length} item(s)`,
                        description: 'Digital Download' 
                    },
                    unit_amount: finalTotalInCents,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: success_url, 
            cancel_url: `${process.env.URL || 'http://localhost:8888'}/`,
            metadata: {
                productIds: JSON.stringify(productIds) 
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ url: session.url }),
        };

    } catch (err) {
        console.error('Checkout Error:', err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message }),
        };
    }
};
