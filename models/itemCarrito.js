const mongoose = require('mongoose');

const itemCarritoSchema = new mongoose.Schema({
    productoId: { 
        type: String, 
        required: true 
    },
    cantidad: { 
        type: Number, 
        required: true,
        min: 1 
    }
}, { _id: false });

module.exports = itemCarritoSchema;