const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    let orderData = {};

    // --- 1. PARSE INCOMING DATA ---
    if (event.headers['stripe-signature']) {
        try {
            const stripeEvent = stripe.webhooks.constructEvent(event.body, event.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
            if (stripeEvent.type !== 'checkout.session.completed') return { statusCode: 200 };
            const session = stripeEvent.data.object;
            orderData = {
                rawItems: session.metadata.order_details, // "uuid:qty,uuid:qty"
                email: session.customer_details.email,
                name: session.customer_details.name,
                address: `${session.shipping_details.address.line1}, ${session.shipping_details.address.city}, ${session.shipping_details.address.postal_code}`,
                source: 'stripe'
            };
        } catch (err) { return { statusCode: 400 }; }
    } else {
        const body = JSON.parse(event.body);
        if (body.source !== 'paypal') return { statusCode: 400 };
        const ship = body.details.purchase_units[0].shipping;
        orderData = {
            rawItems: Object.entries(body.cart).map(([id, item]) => `${id}:${item.qty}`).join(','),
            email: body.details.payer.email_address,
            name: ship.name.full_name,
            address: `${ship.address.address_line_1}, ${ship.address.admin_area_2}, ${ship.address.postal_code}`,
            source: 'paypal'
        };
    }

    try {
        // --- 2. FETCH TITLES FOR PRETTY EMAILS ---
        const itemPairs = orderData.rawItems.split(',');
        let displayItems = [];
        
        for (const pair of itemPairs) {
            const [id, qty] = pair.split(':');
            const { data: book } = await supabase.from('books').select('title').eq('id', id).single();
            displayItems.push(`${qty}x ${book ? book.title : id}`);
            
            // --- 3. DECREMENT STOCK ---
            await supabase.rpc('decrement_stock', { row_id: id, amount: parseInt(qty) });
        }
        const prettyItemList = displayItems.join(', ');

        // --- 4. RECORD ORDER IN DB ---
        await supabase.from('orders').insert([{
            customer_name: orderData.name,
            customer_email: orderData.email,
            shipping_address: orderData.address,
            items: prettyItemList, // Now saves "1x Altcomics 7" instead of UUID
            source: orderData.source
        }]);

        // --- 5. SEND EMAILS ---
        // To Merchant
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'hallhassi@gmail.com',
            subject: `New Order: ${orderData.name}`,
            html: `<p><strong>Items:</strong> ${prettyItemList}</p><p><strong>Ship to:</strong> ${orderData.address}</p>`
        });

        // To Customer (Will only work for non-account emails if domain is verified)
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: orderData.email,
            subject: `Order Confirmation`,
            html: `<p>Hi ${orderData.name},</p><p>Thanks for your order of <strong>${prettyItemList}</strong>.</p><p>It will be shipped to ${orderData.address} soon.</p>`
        });

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (err) {
        console.error('Error:', err);
        return { statusCode: 500 };
    }
};
