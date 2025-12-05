const mongoose = require('mongoose');
const itemCarritoSchema = require('./itemCarrito');

const compraSchema = new mongoose.Schema({
    clienteId: { type: String, required: true },
    total: { type: Number, required: true },
    fecha: { type: Date, default: Date.now },
    items: [itemCarritoSchema],
    cuponUsado: { type: String, default: null },
    descuentoAplicado: { type: Number, default: 0 },
    totalPagado: { type: Number, required: true }
});

module.exports = mongoose.model('Compra', compraSchema);