const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    const sig = event.headers['stripe-signature'];
    let stripeEvent;

    try {
        stripeEvent = stripe.webhooks.constructEvent(event.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return { statusCode: 400 };
    }

    if (stripeEvent.type === 'checkout.session.completed') {
        const productIds = JSON.parse(stripeEvent.data.object.metadata.productIds);
        
        // Mark as sold
        await supabase.from('products').update({ sold: true }).in('id', productIds);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
