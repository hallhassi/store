const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    let orderData = {};

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
                address: `${session.shipping_details.address.line1}, ${session.shipping_details.address.city}, ${session.shipping_details.address.postal_code}`
            };
        } catch (err) { 
            console.error('Stripe Sig Error:', err.message);
            return { statusCode: 400 }; 
        }
    } else {
        const body = JSON.parse(event.body);
        if (body.source !== 'paypal') return { statusCode: 400 };
        const ship = body.details.purchase_units[0].shipping;
        orderData = {
            items: Object.entries(body.cart).map(([id, item]) => `${id}:${item.qty}`).join(','),
            email: body.details.payer.email_address,
            name: ship.name.full_name,
            address: `${ship.address.address_line_1}, ${ship.address.admin_area_2}, ${ship.address.postal_code}`
        };
    }

    try {
        // 1. RECORD ORDER
        const { error: dbError } = await supabase.from('orders').insert([{
            customer_name: orderData.name,
            customer_email: orderData.email,
            shipping_address: orderData.address,
            items: orderData.items,
            source: event.headers['stripe-signature'] ? 'stripe' : 'paypal'
        }]);
        if (dbError) console.error('Database Insert Error:', dbError.message);

        // 2. DECREMENT STOCK
        const pairs = orderData.items.split(',');
        for (const pair of pairs) {
            const [id, qtyStr] = pair.split(':');
            const qty = parseInt(qtyStr);
            if (id && !isNaN(qty)) {
                const { error: rpcError } = await supabase.rpc('decrement_stock', { row_id: id, amount: qty });
                if (rpcError) console.error(`RPC Error for ${id}:`, rpcError.message);
            }
        }

        // 3. EMAIL TO MERCHANT (YOU)
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'hallhassi@gmail.com', 
            subject: `New Order: ${orderData.name}`,
            html: `<p><strong>Items:</strong> ${orderData.items}</p><p><strong>Ship to:</strong> ${orderData.address}</p>`
        });

        // 4. EMAIL TO CUSTOMER (THE RECEIPT)
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: orderData.email, // Sends to the buyer
            subject: `Order Confirmation`,
            html: `<p>Thank you for your order, ${orderData.name}.</p><p>I'll be shipping your items to ${orderData.address} shortly.</p>`
        });

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (err) {
        console.error('Processing Error:', err);
        return { statusCode: 500 };
    }
};
