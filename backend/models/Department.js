
const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },

    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    isArchived: {
        type: Boolean,
        default: false
    },


}, {
    timestamps: true
});

module.exports = mongoose.model('Department', departmentSchema);
