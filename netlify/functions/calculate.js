const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    // 1. Safety check for the URL and Key
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return { statusCode: 500, body: JSON.stringify({ error: "Missing Env Vars" }) };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { cart, region, method } = JSON.parse(event.body);

    try {
        // 2. Fetch books and rates
        const [booksReq, ratesReq] = await Promise.all([
            supabase.from('books').in('id', Object.keys(cart)),
            supabase.from('shipping_rates').select('*')
        ]);

        const books = booksReq.data;
        const rates = ratesReq.data;

        let subtotal = 0;
        let totalGrams = 0;
        let breakdown = [];

        books.forEach(book => {
            const qty = cart[book.id].qty;
            const itemTotal = book.price * qty;
            subtotal += itemTotal;
            totalGrams += (book.weight * qty);
            breakdown.push(`$${itemTotal} ${qty}x ${book.title}`);
        });

        const weightLbs = (totalGrams / 453.592) * 1.2;
        let shippingCost = 0;

        // 3. Shipping Calculation
        if (region === 'usa') {
            const base = rates.find(r => r.region === 'usa' && !r.is_incremental);
            const extra = rates.find(r => r.region === 'usa' && r.is_incremental);
            const roundedWeight = Math.ceil(weightLbs);
            shippingCost = base.price + (Math.max(0, roundedWeight - 1) * extra.price);
        } else {
            let remainingWeight = weightLbs;
            const regionTiers = rates.filter(r => r.region === region).sort((a, b) => a.weight_limit_lbs - b.weight_limit_lbs);
            while (remainingWeight > 0) {
                const currentBoxWeight = Math.min(remainingWeight, 4);
                const tier = regionTiers.find(r => currentBoxWeight <= r.weight_limit_lbs) || regionTiers[regionTiers.length - 1];
                shippingCost += parseFloat(tier.price);
                remainingWeight -= currentBoxWeight;
            }
        }
        breakdown.push(`$${shippingCost.toFixed(2)} shipping`);

        // 4. Fees
        let total = subtotal + shippingCost;
        if (method === 'card') total = (total + 0.30) / (1 - 0.029);
        if (method === 'paypal') total = (total + 0.49) / (1 - 0.044);
        
        const fee = total - (subtotal + shippingCost);
        if (fee > 0) breakdown.push(`$${fee.toFixed(2)} fee`);

        return {
            statusCode: 200,
            body: JSON.stringify({ total, breakdown })
        };
    } catch (err) {
        return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
    }
};