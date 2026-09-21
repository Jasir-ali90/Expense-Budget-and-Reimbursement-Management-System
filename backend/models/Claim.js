
const mongoose = require('mongoose');

const claimItemSchema = new mongoose.Schema({
    
    date: {
        type: Date,
        required: true
    },

    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: true
    },

    description: String,

    requestedAmount: {
        type: Number,
        required: true
    },

    approvedAmount: {
        type: Number,
        default: 0
    },

    receiptUrl: String,

    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    
});


const claimSchema = new mongoose.Schema({

    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: true
    },

    title: {
        type: String,
        required: true
    },

    items: [claimItemSchema],

    totalRequested: {
        type: Number,
        required: true
    },

    totalApproved: {
        type: Number,
        default: 0
    },

    status: {
        type: String,
        enum: ['Draft', 'Submitted', 'Returned', 'Approved', 'Rejected', 'Paid'],
        default: 'Draft'
    },

    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',    // Finance Manager
    },

    approvalHistory: [{

        reviewer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        action: {
            type: String,
            enum: ['Submitted', 'Approved', 'Partially Approved', 'Rejected', 'Returned', 'Reassigned', 'Paid'],
        },

        
        comment: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],

    paymentDetails: {
        paidAt: Date,
        method: String,
        referenceNumber: String
    },
    

},{
    timestamps: true
});

module.exports.ClaimItem = mongoose.model('ClaimItem', claimItemSchema);
module.exports.Claim = mongoose.model('Claim', claimSchema);