const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    try {
        const { cart, region, method } = JSON.parse(event.body);
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        
        const [productsReq, ratesReq] = await Promise.all([
            supabase.from('products').select('*'),
            supabase.from('shipping_rates').select('*')
        ]);

        const allProducts = productsReq.data;
        const allRates = ratesReq.data;
        let subtotal = 0;
        let totalGrams = 0;

        // --- Calculate Totals & Weight ---
        Object.keys(cart).forEach(id => {
            const book = allProducts.find(b => b.id === id);
            if (book) {
                subtotal += book.price * cart[id].qty;
                totalGrams += book.weight * cart[id].qty;
            }
        });

        const weightLbs = (totalGrams / 453.592) * 1.2;
        let shipping = 0;
        const searchRegion = region.toLowerCase();

        // --- Shipping Logic ---
        if (searchRegion === 'usa') {
            const base = allRates.find(r => r.region.toLowerCase() === 'usa' && r.is_base_rate);
            const extra = allRates.find(r => r.region.toLowerCase() === 'usa' && !r.is_base_rate);
            shipping = parseFloat(base.price) + (Math.max(0, Math.ceil(weightLbs) - 1) * parseFloat(extra.price));
        } else {
            const regionTiers = allRates.filter(r => r.region.toLowerCase() === searchRegion).sort((a, b) => a.weight_limit_lbs - b.weight_limit_lbs);
            let rem = weightLbs;
            while (rem > 0 && regionTiers.length > 0) {
                const tier = regionTiers.find(r => Math.min(rem, 4) <= r.weight_limit_lbs) || regionTiers[regionTiers.length - 1];
                shipping += parseFloat(tier.price);
                rem -= 4;
            }
        }

        // --- Payment Processing Fee Logic ---
        let finalTotal = subtotal + shipping;
        if (method === 'card') finalTotal = (finalTotal + 0.30) / (1 - 0.029);
        if (method === 'paypal') finalTotal = (finalTotal + 0.49) / (1 - 0.044);
        
        const roundedTotal = parseFloat(finalTotal.toFixed(2));

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
            shipping_address_collection: {
                allowed_countries: [
                    'US', 'CA', 'GB', 'AU', 'AT', 'BE', 'BR', 'BG', 'CL', 'HR', 'CY', 'CZ', 'DK', 
                    'EE', 'FI', 'FR', 'DE', 'GI', 'GR', 'HK', 'HU', 'IS', 'ID', 'IE', 'IL', 'IT', 
                    'JP', 'LV', 'LT', 'LU', 'MY', 'MT', 'MX', 'NL', 'NZ', 'NO', 'PL', 'PT', 'RO', 
                    'SG', 'SK', 'SI', 'ES', 'SE', 'CH', 'TH', 'TR', 'VN'
                ],
            },
            metadata: {
                order_details: Object.entries(cart)
                    .map(([id, item]) => `${id}:${item.qty}`)
                    .join(',')
            },
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'Order from Blaise Larmee' },
                    unit_amount: Math.round(finalTotal * 100),
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
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: err.message }) 
        };
    }
};
