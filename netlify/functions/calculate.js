const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    try {
        const { cart, region, method } = JSON.parse(event.body);

        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error("Missing Supabase Environment Variables");
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const [booksReq, ratesReq] = await Promise.all([
            supabase.from('books').select('*'),
            supabase.from('shipping_rates').select('*')
        ]);

        if (booksReq.error) {
            throw new Error(booksReq.error.message);
        }

        const allBooks = booksReq.data;
        const allRates = ratesReq.data;

        let subtotal = 0;
        let totalGrams = 0;
        let breakdown = [];

        Object.keys(cart).forEach(id => {
            const book = allBooks.find(b => b.id === id);
            if (book) {
                const qty = cart[id].qty;
                const itemTotal = book.price * qty;
                subtotal += itemTotal;
                totalGrams += (book.weight * qty);
                breakdown.push(`$${itemTotal} ${qty}x ${book.title}`);
            }
        });

        const weightLbs = (totalGrams / 453.592) * 1.2;
        let shippingCost = 0;
        const searchRegion = region.toLowerCase();

        if (searchRegion === 'usa') {
            const base = allRates.find(r => r.region.toLowerCase() === 'usa' && r.is_base_rate);
            const extra = allRates.find(r => r.region.toLowerCase() === 'usa' && !r.is_base_rate);

            if (!base || !extra) {
                throw new Error("Shipping rates for USA not found in database.");
            }

            const roundedWeight = Math.ceil(weightLbs);
            shippingCost = parseFloat(base.price) + (Math.max(0, roundedWeight - 1) * parseFloat(extra.price));
        } else {
            let remainingWeight = weightLbs;
            const regionTiers = allRates
                .filter(r => r.region.toLowerCase() === searchRegion)
                .sort((a, b) => a.weight_limit_lbs - b.weight_limit_lbs);

            if (regionTiers.length === 0) {
                throw new Error(`Shipping rates for ${region} not found.`);
            }

            while (remainingWeight > 0) {
                const currentBoxWeight = Math.min(remainingWeight, 4);
                const tier = regionTiers.find(r => currentBoxWeight <= r.weight_limit_lbs) || regionTiers[regionTiers.length - 1];
                shippingCost += parseFloat(tier.price);
                remainingWeight -= currentBoxWeight;
            }
        }

        let total = subtotal + shippingCost;
        if (method === 'card') total = (total + 0.30) / (1 - 0.029);
        if (method === 'paypal') total = (total + 0.49) / (1 - 0.044);

        const fee = total - (subtotal + shippingCost);
        if (fee > 0) breakdown.push(`$${fee.toFixed(2)} fee`);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ total, breakdown })
        };

    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
};
