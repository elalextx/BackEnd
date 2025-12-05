const mongoose = require('mongoose');
const itemCarritoSchema = require('./itemCarrito');

const carritoSchema = new mongoose.Schema({
    clienteId: {
        type: String,
        required: true
    },
    items: [itemCarritoSchema],
    total: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    cuponAplicado: {
        type: String,
        default: null
    },
    descuento: {
        type: Number,
        default: 0
    },
    totalConDescuento: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('Carrito', carritoSchema);