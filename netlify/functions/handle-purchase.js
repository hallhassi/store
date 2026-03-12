const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

exports.handler = async (event) => {
    let orderData = {};

    // --- 1. IDENTIFY SOURCE & PARSE DATA ---
    
    // Check if it's a Stripe Webhook
    if (event.headers['stripe-signature']) {
        try {
            const stripeEvent = stripe.webhooks.constructEvent(
                event.body, 
                event.headers['stripe-signature'], 
                process.env.STRIPE_WEBHOOK_SECRET
            );

            // We only care about the completed session
            if (stripeEvent.type !== 'checkout.session.completed') {
                return { statusCode: 200, body: 'Event received' };
            }
            
            const session = stripeEvent.data.object;
            orderData = {
                items: session.metadata.order_details, // Format: "uuid:qty,uuid:qty"
                email: session.customer_details.email,
                name: session.customer_details.name,
                address: `${session.shipping_details.address.line1}, ${session.shipping_details.address.city}, ${session.shipping_details.address.postal_code}`
            };
        } catch (err) {
            console.error('Stripe Webhook Error:', err.message);
            return { statusCode: 400, body: `Webhook Error: ${err.message}` };
        }
    } 
    // Check if it's a PayPal Fetch from your frontend
    else {
        try {
            const body = JSON.parse(event.body);
            if (body.source !== 'paypal') {
                return { statusCode: 400, body: 'Invalid source' };
            }
            
            const ship = body.details.purchase_units[0].shipping;
            orderData = {
                // Generate same uuid:qty format for the loop below
                items: Object.entries(body.cart).map(([id, item]) => `${id}:${item.qty}`).join(','),
                email: body.details.payer.email_address,
                name: ship.name.full_name,
                address: `${ship.address.address_line_1}, ${ship.address.admin_area_2}, ${ship.address.postal_code}`
            };
        } catch (err) {
            console.error('PayPal Parsing Error:', err.message);
            return { statusCode: 400, body: 'Invalid JSON' };
        }
    }

    // --- 2. SHARED ACTIONS (Inventory & Email) ---

    try {
        // A. Decrement Inventory in Supabase
        if (orderData.items) {
            const pairs = orderData.items.split(',');

            for (const pair of pairs) {
                const [id, qtyStr] = pair.split(':');
                const qty = parseInt(qtyStr);

                if (id && !isNaN(qty)) {
                    const { error } = await supabase.rpc('decrement_stock', { 
                        row_id: id, 
                        amount: qty 
                    });
                    
                    if (error) {
                        console.error(`Supabase Error for ID ${id}:`, error.message);
                    } else {
                        console.log(`Successfully decremented ${id} by ${qty}`);
                    }
                }
            }
        }

        // B. Send Emails via Resend
        // Note: Using onboarding@resend.dev requires the 'to' email to be your Resend login email
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'hallhassi@gmail.com', 
            subject: `New Order: ${orderData.name}`,
            html: `
                <h3>Order Details</h3>
                <p><strong>Items:</strong> ${orderData.items}</p>
                <p><strong>Customer:</strong> ${orderData.name} (${orderData.email})</p>
                <p><strong>Shipping Address:</strong><br>${orderData.address}</p>
            `
        });

        return { 
            statusCode: 200, 
            body: JSON.stringify({ success: true }) 
        };

    } catch (finalErr) {
        console.error('Processing Error:', finalErr);
        return { statusCode: 500, body: 'Internal Server Error' };
    }
};
