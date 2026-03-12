const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    let orderData = {};

    // --- STRIPE LOGIC ---
    if (event.headers['stripe-signature']) {
        try {
            const stripeEvent = stripe.webhooks.constructEvent(
                event.body, 
                event.headers['stripe-signature'], 
                process.env.STRIPE_WEBHOOK_SECRET
            );
            if (stripeEvent.type !== 'checkout.session.completed') return { statusCode: 200 };
            
            const session = stripeEvent.data.object;
            orderData = {
                items: session.metadata.order_details,
                email: session.customer_details.email,
                name: session.customer_details.name,
                address: `${session.shipping_details.address.line1}, ${session.shipping_details.address.city}`
            };
        } catch (err) { return { statusCode: 400 }; }
    } 
    // --- PAYPAL LOGIC ---
    else {
        const body = JSON.parse(event.body);
        if (body.source !== 'paypal') return { statusCode: 400 };
        
        const ship = body.details.purchase_units[0].shipping;
        orderData = {
            items: Object.entries(body.cart).map(([id, item]) => `${item.qty}x ${id}`).join(', '),
            email: body.details.payer.email_address,
            name: ship.name.full_name,
            address: `${ship.address.address_line_1}, ${ship.address.admin_area_2}`
        };
    }

    // --- SHARED ACTIONS (Email & Inventory) ---
    // 1. Decrement Inventory
    const itemArray = orderData.items.split(', ');
    for (const item of itemArray) {
        const [qty, id] = item.split('x ');
        await supabase.rpc('decrement_stock', { row_id: id, amount: parseInt(qty) });
    }

    // 2. Send Emails via Resend
    await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'hallhassi@gmail.com',
        subject: `Order: ${orderData.name}`,
        text: `Items: ${orderData.items}\nShip to: ${orderData.address}`
    });

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
