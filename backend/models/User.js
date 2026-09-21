
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    password: {
        type: String,
        required: true
    },

    role:{
        type: String,
        enum: ['Admin', 'Finance Manager', 'Employee'],
        default: 'Employee'
    },

    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
    },

    isActive:{
        type: Boolean,
        default: true
    }

},{
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
