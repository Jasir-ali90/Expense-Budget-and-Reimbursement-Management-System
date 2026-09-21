
const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },

    period: {     // Format: "YYYY-MM" or "YYYY"
        type: String,
        required: true
    },

    allocatedAmount: {
        type: Number,
        required: true
    },

    warningThresholdPercent: {
        type: Number,
        default: 80     // Default warning threshold is 80% of allocated amount
    },

    history: [{
        revisedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },

        previousAmount: Number,
        newAmount: Number,
        reason: String,
        date:{
            type: Date,
            default: Date.now
        }
    }]
    


}, {
    timestamps: true
});

budgetSchema.index({ department: 1, category: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);