
const categories = require('../models/Category');

const validateClaimItems = async (req, res, next) => {
    const {Items} = req.body;

    for (let item of Items) {
        const category = await categories.findById(item.category);
        if (!category || category.isArchived) {
            return res.status(400).json({ error: `Category with ID ${item.category} does not exist or is archived.` });
        }

        //check receipt constraints
        if (category.requiresReceipt && !item.receiptUrl) {
            return res.status(400).json({ error: `Receipt URL is required for item with ID ${item._id}.` });
        }

        // check max amount constraints
        if (category.maxClaimAmount && item.requestedAmount > category.maxClaimAmount) {
            return res.status(400).json({ 
                error: `Requested amount for item with ID ${item._id} exceeds the maximum allowed amount for its category.` 
            });
        }

    }

    next();
}

module.exports = validateClaimItems;