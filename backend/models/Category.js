
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },

    requiresReceipt: {
        type: Boolean,
        default: true
    },

    maxClaimAmount: {
        type: Number,
        default: null     //null means unlimited claim amount
    },

    isArchived: {
        type: Boolean,
        default: false
    },


}, {
    timestamps: true
});

module.exports = mongoose.model('Category', categorySchema);
