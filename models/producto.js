const mongoose = require('mongoose');
const productoSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    categoria: { type: String },
    precio: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0 },
    imagen: { type: String } 
});

module.exports = mongoose.model('Producto', productoSchema);
