const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    console.log("--- LOUD LOG: FUNCTION START ---");

    try {
        // Log the raw incoming data
        console.log("--- LOUD LOG: RAW EVENT BODY ---", event.body);

        const { cart, region, method } = JSON.parse(event.body);
        console.log("--- LOUD LOG: PARSED DATA ---", { region, method, cart });

        // Check for environment variables
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error("--- LOUD LOG: MISSING ENV VARS ---");
            throw new Error("Missing Supabase Environment Variables");
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        console.log("--- LOUD LOG: FETCHING DB DATA ---");
        const [booksReq, ratesReq] = await Promise.all([
            supabase.from('books').select('*'),
            supabase.from('shipping_rates').select('*')
        ]);

        if (booksReq.error) {
            console.error("--- LOUD LOG: BOOKS DB ERROR ---", booksReq.error.message);
            throw new Error(booksReq.error.message);
        }

        const allBooks = booksReq.data;
        const allRates = ratesReq.data;
        console.log(`--- LOUD LOG: DB DATA RECEIVED --- (Books: ${allBooks.length}, Rates: ${allRates.length})`);

        let subtotal = 0;
        let totalGrams = 0;
        let breakdown = [];

        // 1. Calculate Items
        Object.keys(cart).forEach(id => {
            const book = allBooks.find(b => b.id === id);
            if (book) {
                const qty = cart[id].qty;
                const itemTotal = book.price * qty;
                subtotal += itemTotal;
                totalGrams += (book.weight * qty);
                breakdown.push(`$${itemTotal} ${qty}x ${book.title}`);
            } else {
                console.warn(`--- LOUD LOG: BOOK ID ${id} NOT FOUND IN DB ---`);
            }
        });

        // 2. Shipping Math
        const weightLbs = (totalGrams / 453.592) * 1.2;
        let shippingCost = 0;

        // Force region to lowercase for matching
        const searchRegion = region.toLowerCase();

        if (searchRegion === 'usa') {
            const base = allRates.find(r => r.region.toLowerCase() === 'usa' && !r.is_incremental);
            const extra = allRates.find(r => r.region.toLowerCase() === 'usa' && r.is_incremental);

            if (!base || !extra) {
                console.error("--- LOUD LOG: USA RATES MISSING IN DB ---");
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
                console.error(`--- LOUD LOG: NO RATES FOUND FOR ${searchRegion} ---`);
                throw new Error(`Shipping rates for ${region} not found.`);
            }

            while (remainingWeight > 0) {
                const currentBoxWeight = Math.min(remainingWeight, 4);
                const tier = regionTiers.find(r => currentBoxWeight <= r.weight_limit_lbs) || regionTiers[regionTiers.length - 1];
                shippingCost += parseFloat(tier.price);
                remainingWeight -= currentBoxWeight;
            }
        }

        // 3. Fees
        let total = subtotal + shippingCost;
        if (method === 'card') total = (total + 0.30) / (1 - 0.029);
        if (method === 'paypal') total = (total + 0.49) / (1 - 0.044);

        const fee = total - (subtotal + shippingCost);
        if (fee > 0) breakdown.push(`$${fee.toFixed(2)} fee`);

        console.log("--- LOUD LOG: CALCULATION SUCCESS --- Total:", total);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ total, breakdown })
        };

    } catch (err) {
        console.error("--- LOUD LOG: CRITICAL CATCH ---", err.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message })
        };
    }
};