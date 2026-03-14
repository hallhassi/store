const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    const { method, data, key } = JSON.parse(event.body);

    // 1. Security Check
    // Set ADMIN_SECRET in your Netlify Environment Variables
    if (key !== process.env.ADMIN_SECRET) {
        return { statusCode: 401, body: 'Unauthorized' };
    }

    const supabase = createClient(
        process.env.SUPABASE_URL, 
        process.env.SUPABASE_SERVICE_ROLE_KEY // Use the Secret Key here
    );

    try {
        let result;
        if (event.httpMethod === 'POST') {
            // Create or Update logic
            result = await supabase.from('products').upsert(data);
        } else if (event.httpMethod === 'DELETE') {
            // Delete logic
            result = await supabase.from('products').delete().eq('id', data.id);
        }

        return {
            statusCode: 200,
            body: JSON.stringify(result.data)
        };
    } catch (err) {
        return { statusCode: 500, body: err.message };
    }
};
