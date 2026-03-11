const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { cart, region, method } = JSON.parse(event.body);

    // 1. Get Product Data & Shipping Rates in parallel
    const [booksReq, ratesReq] = await Promise.all([
        supabase.from('books').in('id', Object.keys(cart)),
        supabase.from('shipping_rates').select('*')
    ]);

    const books = booksReq.data;
    const rates = ratesReq.data;

    let subtotal = 0;
    let totalGrams = 0;
    books.forEach(book => {
        const qty = cart[book.id].qty;
        subtotal += (book.price * qty);
        totalGrams += (book.weight * qty);
    });

    const weightLbs = (totalGrams / 453.592) * 1.2; // Including packaging weight
    let shippingCost = 0;

    // 2. Calculate Shipping based on Region
    if (region === 'usa') {
        const baseRate = rates.find(r => r.region === 'usa' && !r.is_incremental).price;
        const extraRate = rates.find(r => r.region === 'usa' && r.is_incremental).price;
        const roundedWeight = Math.ceil(weightLbs);
        shippingCost = baseRate + (Math.max(0, roundedWeight - 1) * extraRate);
    } else {
        // International Box Logic (Handles weights > 4lbs by splitting boxes)
        let remainingWeight = weightLbs;
        const regionTiers = rates.filter(r => r.region === region).sort((a, b) => a.weight_limit_lbs - b.weight_limit_lbs);
        
        while (remainingWeight > 0) {
            const currentBoxWeight = Math.min(remainingWeight, 4);
            const tier = regionTiers.find(r => currentBoxWeight <= r.weight_limit_lbs) || regionTiers[regionTiers.length - 1];
            shippingCost += parseFloat(tier.price);
            remainingWeight -= currentBoxWeight;
        }
    }

    // 3. Final Fee Calculation (Stripe/PayPal)
    // Formula: (Subtotal + Shipping + FixedFee) / (1 - %Fee)
    let total = subtotal + shippingCost;
    if (method === 'card') total = (total + 0.30) / (1 - 0.029);
    if (method === 'paypal') total = (total + 0.49) / (1 - 0.044);

    return {
        statusCode: 200,
        body: JSON.stringify({
            total: total,
            breakdown: [
                `Items: $${subtotal.toFixed(2)}`,
                `Shipping: $${shippingCost.toFixed(2)}`,
                `Total: $${total.toFixed(2)}`
            ]
        })
    };
};