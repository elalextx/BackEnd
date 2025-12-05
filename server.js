const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { ApolloServer, gql } = require('apollo-server-express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Modelos
const Usuario = require('./models/usuario');
const Cliente = require('./models/cliente');
const Empleado = require('./models/empleado');
const Producto = require('./models/producto');
const Carrito = require('./models/carrito');
const Compra = require('./models/compra'); 
const Reembolso = require('./models/reembolso');
const Cupon = require('./models/cupon');

// Conexion MongoDB
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/naturalpower")
    .then(() => console.log("MongoDB conectado"))
    .catch((err) => console.error("Error MongoDB:", err));

// Configuracion JWT
const JWT_SECRET = process.env.JWT_SECRET || "CAMBIA_ESTA_CLAVE_A_UNA_SEGURA";
const TOKEN_EXPIRES = "8h";

// Blacklist en memoria
const blacklist = new Set();

// Rate limiting en memoria para login
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

// Esquema GraphQL
const typeDefs = gql`

    type AuthPayload {
        token: String!
        usuario: Usuario!
    }

    type Response {
        status: String!
        message: String!
    }

    type Usuario {
        id: ID!
        nombre: String!
        email: String!
        pass: String!
        rut: String!
        perfilTipo: String!
        perfil: Perfil
    }

    union Perfil = Cliente | Empleado

    type ClienteData {
        nombre: String!
        email: String!
        direccion: String
        comuna: String
        provincia: String
        region: String
        telefono: String
    }

    type Cliente {
        id: ID!
        rut: String!
        nombre: String!
        email: String!
        pass: String!
        estado: String!
        direccion: String
        comuna: String
        provincia: String
        region: String
        fechaNacimiento: String
        sexo: String
        telefono: String
    }

    type Empleado {
        id: ID!
        rut: String!
        nombre: String!
        email: String!
        pass: String!
        cargo: String!
    }

    type Producto {
        id: ID!
        nombre: String!
        precio: Int!
        stock: Int!
        categoria: String!
        descripcion: String
        imagen: String
    }

    type ItemCarrito {
        productoId: String!
        cantidad: Int!
    }

    type Carrito {
        id: ID!
        clienteId: String!
        items: [ItemCarrito]!
        total: Int!
        cuponAplicado: String
        descuento: Int
        totalConDescuento: Int
    }

    type Compra {
        id: ID!
        clienteId: String!
        total: Int!
        fecha: String!
        items: [ItemCarrito]!
        cuponUsado: String
        descuentoAplicado: Int
        totalPagado: Int
        clienteData: ClienteData
    }

    type Reembolso {
        id: ID!
        compraId: String!
        motivo: String!
        estado: String!
    }
    
    type Cupon {
        id: ID!
        codigo: String!
        porcentaje: Int!
        descuentoFijo: Int
        tipo: String!
        fechaInicio: String!
        fechaFin: String!
        usosMaximos: Int!
        usosActuales: Int!
        activo: Boolean!
        minimoCompra: Int!
    }

    type CuponValidacion {
        valido: Boolean!
        mensaje: String!
        cupon: Cupon
        descuento: Int
    }

    # QUERIES
    type Query {
        me: Usuario

        getUsuarios: [Usuario]
        getClientes: [Cliente]
        getEmpleados: [Empleado]
        getProductos: [Producto]
        getProducto(id: ID!): Producto
        getProductosByCategoria(categoria: String!): [Producto]

        getCarritoByCliente(clienteId: String!): Carrito
        getCompraByCliente(rut: String!): [Compra]

        getCompras: [Compra]
        getComprasDelDia: [Compra]

        getReembolsos: [Reembolso]

        getCupones: [Cupon]
        getCupon(codigo: String!): Cupon
        validarCupon(codigo: String!, clienteId: String!): CuponValidacion
    }

    # MUTATIONS
    type Mutation {

        login(email: String!, pass: String!): AuthPayload
        logout(token: String!): Response
        resetPassword(email: String!, newPass: String!): Response

        addUsuario(nombre: String!, email: String!, pass: String!, rut: String!, perfilTipo: String!): Usuario

        addCliente(
            rut: String!, 
            nombre: String!, 
            email: String!, 
            pass: String!,
            direccion: String,
            comuna: String,
            provincia: String,
            region: String,
            fechaNacimiento: String,
            sexo: String,
            telefono: String
        ): Cliente
        
        updateClienteCompleto(
            rut: String!, 
            nombre: String!, 
            email: String!, 
            estado: String!,
            direccion: String,
            comuna: String,
            provincia: String,
            region: String,
            fechaNacimiento: String,
            sexo: String,
            telefono: String
        ): Cliente
        
        updateCliente(rut: String!, estado: String!): Cliente
        deleteCliente(rut: String!): Response

        addEmpleado(rut: String!, nombre: String!, email: String!, pass: String!, cargo: String!): Empleado
        updateEmpleadoCompleto(rut: String!, nombre: String!, email: String!, cargo: String!): Empleado
        deleteEmpleado(rut: String!): Response

        addProducto(nombre: String!, precio: Int!, stock: Int!, categoria: String!, descripcion: String, imagen: String): Producto
        updateProducto(id: ID!, nombre: String!, precio: Int!, stock: Int!, categoria: String!, descripcion: String, imagen: String): Producto
        deleteProducto(id: ID!): Response

        crearCarrito(clienteId: String!): Carrito
        agregarItemCarrito(clienteId: String!, productoId: String!, cantidad: Int!): Carrito
        confirmarCompra(clienteId: String!): Compra

        solicitarReembolso(compraId: String!, motivo: String!): Reembolso
        atenderReembolso(id: ID!, estado: String!): Reembolso

        crearCupon(codigo: String!, porcentaje: Int!, tipo: String!, fechaInicio: String!, fechaFin: String!, usosMaximos: Int!, minimoCompra: Int, descuentoFijo: Int): Cupon
        aplicarCupon(codigo: String!, clienteId: String!): Carrito
        removerCupon(clienteId: String!): Carrito
        deleteCupon(id: ID!): Response

    }
`;

// Resolvers
const resolvers = {

    Perfil: {
        __resolveType(obj) {
            if (!obj) return null;
            if (obj.cargo) return "Empleado";
            if (obj.estado !== undefined) return "Cliente";
            return null;
        },
    },

    Query: {

        me: async (_, __, { user }) => {
            if (!user) return null;
            return Usuario.findById(user.id).populate("perfil").exec();
        },

        getUsuarios: async () => {
            return await Usuario.find().populate("perfil").exec();
        },

        getClientes: async () => {
            const clientes = await Cliente.find().exec();
            return clientes.filter(cliente => cliente.rut && cliente.rut.trim() !== '');
        },

        getEmpleados: async () => {
            const empleados = await Empleado.find().exec();
            return empleados.filter(empleado => empleado.rut && empleado.rut.trim() !== '');
        },

        getProductos: () => Producto.find().exec(),
        getProducto: (_, { id }) => Producto.findById(id).exec(),
        getProductosByCategoria: (_, { categoria }) => 
            Producto.find({ categoria }).exec(),

        getCarritoByCliente: (_, { clienteId }) =>
            Carrito.findOne({ clienteId }).exec(),

        getCompraByCliente: async (_, { rut }) => {
            try {
                const compras = await Compra.find({ clienteId: rut }).sort({ fecha: -1 }).exec();
                
                const comprasConCliente = await Promise.all(
                    compras.map(async (compra) => {
                        if (!compra) return null;
                        
                        const cliente = await Cliente.findOne({ rut: compra.clienteId }).exec();
                        return {
                            id: compra._id ? compra._id.toString() : '',
                            clienteId: compra.clienteId || '',
                            total: compra.total || 0,
                            totalPagado: compra.totalPagado || compra.total || 0,
                            descuentoAplicado: compra.descuentoAplicado || 0,
                            cuponUsado: compra.cuponUsado || null,
                            fecha: compra.fecha ? compra.fecha.toISOString() : new Date().toISOString(),
                            items: compra.items ? compra.items.map(item => ({
                                productoId: item.productoId ? item.productoId.toString() : '',
                                cantidad: item.cantidad || 0
                            })) : [],
                            clienteData: cliente ? {
                                nombre: cliente.nombre || '',
                                email: cliente.email || '',
                                direccion: cliente.direccion || '',
                                comuna: cliente.comuna || '',
                                provincia: cliente.provincia || '',
                                region: cliente.region || '',
                                telefono: cliente.telefono || ''
                            } : {
                                nombre: '',
                                email: '',
                                direccion: '',
                                comuna: '',
                                provincia: '',
                                region: '',
                                telefono: ''
                            }
                        };
                    })
                );
                
                return comprasConCliente.filter(compra => compra !== null);
            } catch (error) {
                console.error('Error en getCompraByCliente:', error);
                return [];
            }
        },

        getCompras: async (_, __, { user }) => {
            if (!user || user.perfilTipo !== 'Empleado')
                throw new Error("Acceso denegado");
            
            try {
                const compras = await Compra.find().sort({ fecha: -1 }).exec();
                
                const comprasConCliente = await Promise.all(
                    compras.map(async (compra) => {
                        if (!compra) return null;
                        
                        const cliente = await Cliente.findOne({ rut: compra.clienteId }).exec();
                        return {
                            id: compra._id ? compra._id.toString() : '',
                            clienteId: compra.clienteId || '',
                            total: compra.total || 0,
                            totalPagado: compra.totalPagado || compra.total || 0,
                            descuentoAplicado: compra.descuentoAplicado || 0,
                            cuponUsado: compra.cuponUsado || null,
                            fecha: compra.fecha ? compra.fecha.toISOString() : new Date().toISOString(),
                            items: compra.items ? compra.items.map(item => ({
                                productoId: item.productoId ? item.productoId.toString() : '',
                                cantidad: item.cantidad || 0
                            })) : [],
                            clienteData: cliente ? {
                                nombre: cliente.nombre || '',
                                email: cliente.email || '',
                                direccion: cliente.direccion || '',
                                comuna: cliente.comuna || '',
                                provincia: cliente.provincia || '',
                                region: cliente.region || '',
                                telefono: cliente.telefono || ''
                            } : {
                                nombre: '',
                                email: '',
                                direccion: '',
                                comuna: '',
                                provincia: '',
                                region: '',
                                telefono: ''
                            }
                        };
                    })
                );
                
                return comprasConCliente.filter(compra => compra !== null);
            } catch (error) {
                console.error('Error en getCompras:', error);
                throw new Error("Error obteniendo compras");
            }
        },

        getComprasDelDia: async (_, __, { user }) => {
            if (!user || user.perfilTipo !== 'Empleado')
                throw new Error("Acceso denegado");

            try {
                const now = new Date();
                const inicio = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const fin = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

                const compras = await Compra.find({ 
                    fecha: { $gte: inicio, $lt: fin } 
                }).sort({ fecha: 1 }).exec();
                
                const comprasConCliente = await Promise.all(
                    compras.map(async (compra) => {
                        if (!compra) return null;
                        
                        const cliente = await Cliente.findOne({ rut: compra.clienteId }).exec();
                        return {
                            id: compra._id ? compra._id.toString() : '',
                            clienteId: compra.clienteId || '',
                            total: compra.total || 0,
                            totalPagado: compra.totalPagado || compra.total || 0,
                            descuentoAplicado: compra.descuentoAplicado || 0,
                            cuponUsado: compra.cuponUsado || null,
                            fecha: compra.fecha ? compra.fecha.toISOString() : new Date().toISOString(),
                            items: compra.items ? compra.items.map(item => ({
                                productoId: item.productoId ? item.productoId.toString() : '',
                                cantidad: item.cantidad || 0
                            })) : [],
                            clienteData: cliente ? {
                                nombre: cliente.nombre || '',
                                email: cliente.email || '',
                                direccion: cliente.direccion || '',
                                comuna: cliente.comuna || '',
                                provincia: cliente.provincia || '',
                                region: cliente.region || '',
                                telefono: cliente.telefono || ''
                            } : {
                                nombre: '',
                                email: '',
                                direccion: '',
                                comuna: '',
                                provincia: '',
                                region: '',
                                telefono: ''
                            }
                        };
                    })
                );
                
                return comprasConCliente.filter(compra => compra !== null);
            } catch (error) {
                console.error('Error en getComprasDelDia:', error);
                throw new Error("Error obteniendo compras del día");
            }
        },

        getReembolsos: () => Reembolso.find().exec(),

        getCupones: async (_, __, { user }) => {
            if (!user || user.perfilTipo !== 'Empleado') {
                throw new Error("Acceso denegado");
            }
            return await Cupon.find().sort({ fechaInicio: -1 }).exec();
        },

        getCupon: async (_, { codigo }, { user }) => {
            if (!user || user.perfilTipo !== 'Empleado') {
                throw new Error("Acceso denegado");
            }
            return await Cupon.findOne({ codigo: codigo.toUpperCase() }).exec();
        },

        validarCupon: async (_, { codigo, clienteId }) => {
            const cupon = await Cupon.findOne({ codigo: codigo.toUpperCase() }).exec();
            
            if (!cupon) {
                return { valido: false, mensaje: "Cupón no encontrado" };
            }
            
            if (!cupon.activo) {
                return { valido: false, mensaje: "Cupón inactivo" };
            }
            
            const ahora = new Date();
            if (ahora < cupon.fechaInicio) {
                return { valido: false, mensaje: "Cupón aún no disponible" };
            }
            
            if (ahora > cupon.fechaFin) {
                return { valido: false, mensaje: "Cupón expirado" };
            }
            
            if (cupon.usosActuales >= cupon.usosMaximos) {
                return { valido: false, mensaje: "Cupón agotado" };
            }
            
            const carrito = await Carrito.findOne({ clienteId }).exec();
            if (!carrito) {
                return { 
                    valido: false, 
                    mensaje: "Carrito vacío" 
                };
            }
            
            if (carrito.total < cupon.minimoCompra) {
                return { 
                    valido: false, 
                    mensaje: `Mínimo de compra: $${cupon.minimoCompra}` 
                };
            }
            
            let descuento = 0;
            if (cupon.tipo === 'porcentaje') {
                descuento = Math.round(carrito.total * (cupon.porcentaje / 100));
            } else {
                descuento = cupon.descuentoFijo || 0;
            }
            
            return {
                valido: true,
                mensaje: "Cupón válido",
                cupon,
                descuento
            };
        },        
    },

    Mutation: {

        login: async (_, { email, pass }, { req }) => {
            const ip = req?.ip || 'local';
            const now = Date.now();
            
            if (loginAttempts.has(ip)) {
                const attempt = loginAttempts.get(ip);
                if (now - attempt.timestamp > LOGIN_WINDOW_MS) {
                    loginAttempts.delete(ip);
                } else if (attempt.count >= LOGIN_MAX_ATTEMPTS) {
                    throw new Error("Demasiados intentos de login. Espere 15 minutos.");
                }
            }
            
            if (!email || typeof email !== 'string' || email.length > 100) {
                throw new Error("Email inválido");
            }
            
            if (!pass || typeof pass !== 'string' || pass.length > 100) {
                throw new Error("Contraseña inválida");
            }
            
            const usuario = await Usuario.findOne({ email: String(email) }).populate("perfil").exec();
            if (!usuario) {
                const currentAttempt = loginAttempts.get(ip) || { count: 0, timestamp: now };
                currentAttempt.count++;
                currentAttempt.timestamp = now;
                loginAttempts.set(ip, currentAttempt);
                
                throw new Error("Credenciales incorrectas");
            }

            let ok = false;
            if (usuario.pass.startsWith("$2")) ok = await bcrypt.compare(pass, usuario.pass);
            else ok = (usuario.pass === pass);

            if (!ok) {
                const currentAttempt = loginAttempts.get(ip) || { count: 0, timestamp: now };
                currentAttempt.count++;
                currentAttempt.timestamp = now;
                loginAttempts.set(ip, currentAttempt);
                
                throw new Error("Credenciales incorrectas");
            }

            loginAttempts.delete(ip);

            const payload = {
                id: usuario.id,
                email: usuario.email,
                nombre: usuario.nombre,
                perfilTipo: usuario.perfilTipo
            };

            const token = jwt.sign(payload, JWT_SECRET, {
                expiresIn: TOKEN_EXPIRES,
            });

            return { token, usuario };
        },

        logout: async (_, { token }) => {
            blacklist.add(token);
            return { status: "200", message: "Sesión cerrada exitosamente" };
        },

        addUsuario: async (_, args) => {
            const hashed = await bcrypt.hash(args.pass, 10);
            return Usuario.create({ ...args, pass: hashed });
        },

        addCliente: async (_, args) => {
            if (!args.rut || !/^[0-9]{7,8}-[0-9kK]{1}$/.test(args.rut)) {
                throw new Error("Formato de RUT inválido. Use: 12345678-9");
            }
            
            if (!args.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
                throw new Error("Email inválido");
            }
            
            if (!args.nombre || args.nombre.trim().length < 2) {
                throw new Error("Nombre debe tener al menos 2 caracteres");
            }
            
            if (!args.pass || args.pass.length < 6) {
                throw new Error("Contraseña debe tener al menos 6 caracteres");
            }
            
            const hashed = await bcrypt.hash(args.pass, 10);
            
            const cliente = await Cliente.create({
                rut: String(args.rut),
                nombre: String(args.nombre),
                email: String(args.email),
                pass: hashed,
                estado: 'pendiente',
                direccion: args.direccion ? String(args.direccion) : '',
                comuna: args.comuna ? String(args.comuna) : '',
                provincia: args.provincia ? String(args.provincia) : '',
                region: args.region ? String(args.region) : '',
                fechaNacimiento: args.fechaNacimiento ? new Date(args.fechaNacimiento) : null,
                sexo: args.sexo ? String(args.sexo) : '',
                telefono: args.telefono ? String(args.telefono) : ''
            });
            
            await Usuario.create({
                nombre: String(args.nombre),
                email: String(args.email),
                pass: hashed,
                rut: String(args.rut),
                perfilTipo: 'Cliente',
                perfil: cliente._id
            });
            
            return cliente;
        },

        addEmpleado: async (_, args) => {
            if (!args.rut || !/^[0-9]{7,8}-[0-9kK]{1}$/.test(args.rut)) {
                throw new Error("Formato de RUT inválido. Use: 12345678-9");
            }
            
            if (!args.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
                throw new Error("Email inválido");
            }
            
            if (!args.nombre || args.nombre.trim().length < 2) {
                throw new Error("Nombre debe tener al menos 2 caracteres");
            }
            
            if (!args.pass || args.pass.length < 6) {
                throw new Error("Contraseña debe tener al menos 6 caracteres");
            }
            
            if (!args.cargo || args.cargo.trim().length < 2) {
                throw new Error("Cargo debe tener al menos 2 caracteres");
            }
            
            const hashed = await bcrypt.hash(args.pass, 10);
            
            const empleado = await Empleado.create({
                rut: String(args.rut),
                nombre: String(args.nombre),
                email: String(args.email),
                pass: hashed,
                cargo: String(args.cargo)
            });
            
            await Usuario.create({
                nombre: String(args.nombre),
                email: String(args.email),
                pass: hashed,
                rut: String(args.rut),
                perfilTipo: 'Empleado',
                perfil: empleado._id
            });
            
            return empleado;
        },

        addProducto: (_, args) => {
            if (!args.nombre || args.nombre.trim().length < 2) {
                throw new Error("Nombre del producto inválido");
            }
            
            if (args.precio < 0) {
                throw new Error("Precio no puede ser negativo");
            }
            
            if (args.stock < 0) {
                throw new Error("Stock no puede ser negativo");
            }
            
            return Producto.create({
                ...args,
                nombre: String(args.nombre),
                categoria: String(args.categoria || ''),
                descripcion: args.descripcion ? String(args.descripcion) : '',
                imagen: args.imagen ? String(args.imagen) : ''
            });
        },

        updateProducto: (_, { id, ...rest }) => {
            if (rest.precio !== undefined && rest.precio < 0) {
                throw new Error("Precio no puede ser negativo");
            }
            
            if (rest.stock !== undefined && rest.stock < 0) {
                throw new Error("Stock no puede ser negativo");
            }
            
            return Producto.findByIdAndUpdate(id, rest, { new: true }).exec();
        },

        deleteProducto: async (_, { id }) => {
            await Producto.findByIdAndDelete(id).exec();
            return { status: "200", message: "Producto eliminado" };
        },

        crearCarrito: async (_, { clienteId }) => {
            return Carrito.findOneAndUpdate(
                { clienteId: String(clienteId) },
                { $setOnInsert: { items: [], total: 0 } },
                { upsert: true, new: true }
            ).exec();
        },

        agregarItemCarrito: async (_, { clienteId, productoId, cantidad }) => {
            if (cantidad < 1) {
                throw new Error("La cantidad debe ser al menos 1");
            }

            let carrito = await Carrito.findOne({ clienteId: String(clienteId) }).exec();
            
            if (!carrito) {
                carrito = await Carrito.create({ 
                    clienteId: String(clienteId), 
                    items: [], 
                    total: 0,
                    descuento: 0,
                    totalConDescuento: 0
                });
            }

            const producto = await Producto.findById(String(productoId)).exec();
            if (!producto) throw new Error("Producto no encontrado");
            
            const itemExistente = carrito.items.find(item => 
                item.productoId.toString() === productoId.toString()
            );

            const cantidadTotal = itemExistente ? 
                itemExistente.cantidad + cantidad : cantidad;

            if (cantidadTotal > producto.stock) {
                throw new Error(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.stock}, Solicitado: ${cantidadTotal}`);
            }

            if (itemExistente) {
                itemExistente.cantidad += cantidad;
            } else {
                carrito.items.push({ productoId: String(productoId), cantidad });
            }

            let nuevoTotal = 0;
            for (const item of carrito.items) {
                const prod = await Producto.findById(item.productoId).exec();
                if (prod) {
                    nuevoTotal += prod.precio * item.cantidad;
                }
            }
            
            carrito.total = nuevoTotal;
            
            if (carrito.cuponAplicado) {
                const cupon = await Cupon.findOne({ codigo: carrito.cuponAplicado }).exec();
                if (cupon && cupon.activo) {
                    let descuentoCalculado = 0;
                    if (cupon.tipo === 'porcentaje') {
                        descuentoCalculado = Math.round(carrito.total * (cupon.porcentaje / 100));
                    } else {
                        descuentoCalculado = cupon.descuentoFijo || 0;
                    }
                    
                    descuentoCalculado = Math.min(descuentoCalculado, carrito.total);
                    carrito.descuento = descuentoCalculado;
                    carrito.totalConDescuento = carrito.total - descuentoCalculado;
                } else {
                    carrito.cuponAplicado = null;
                    carrito.descuento = 0;
                    carrito.totalConDescuento = carrito.total;
                }
            } else {
                carrito.totalConDescuento = carrito.total;
            }

            await carrito.save();
            
            return carrito;
        },

        solicitarReembolso: (_, args) => {
            if (!args.motivo || args.motivo.trim().length < 10) {
                throw new Error("El motivo debe tener al menos 10 caracteres");
            }
            
            return Reembolso.create({ 
                ...args, 
                compraId: String(args.compraId),
                motivo: String(args.motivo),
                estado: "Pendiente" 
            });
        },

        atenderReembolso: (_, { id, estado }) => {
            if (!['Aprobado', 'Rechazado'].includes(estado)) {
                throw new Error("Estado inválido. Use: Aprobado o Rechazado");
            }
            
            return Reembolso.findByIdAndUpdate(id, { estado: String(estado) }, { new: true }).exec();
        },

        resetPassword: async (_, { email, newPass }) => {
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return { status: "400", message: "Email inválido" };
            }
            
            if (!newPass || newPass.length < 6) {
                return { status: "400", message: "Contraseña debe tener al menos 6 caracteres" };
            }
            
            const usuario = await Usuario.findOne({ email: String(email) }).exec();
            if (!usuario)
                return { status: "404", message: "Usuario no encontrado" };

            const hashed = await bcrypt.hash(newPass, 10);
            usuario.pass = hashed;
            await usuario.save();

            return { status: "200", message: "Contraseña actualizada" };
        },

        updateCliente: async (_, { rut, estado }) => {
            if (!['pendiente', 'activo', 'rechazado'].includes(estado)) {
                throw new Error("Estado inválido. Use: pendiente, activo o rechazado");
            }
            
            const cliente = await Cliente.findOneAndUpdate(
                { rut: String(rut) },
                { estado: String(estado) },
                { new: true }
            ).exec();
            if (!cliente) throw new Error("Cliente no encontrado");
            return cliente;
        },

        updateClienteCompleto: async (_, { 
            rut, nombre, email, estado,
            direccion, comuna, provincia, region,
            fechaNacimiento, sexo, telefono 
        }) => {
            if (!['pendiente', 'activo', 'rechazado'].includes(estado)) {
                throw new Error("Estado inválido. Use: pendiente, activo o rechazado");
            }
            
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new Error("Email inválido");
            }
            
            if (!nombre || nombre.trim().length < 2) {
                throw new Error("Nombre debe tener al menos 2 caracteres");
            }
            
            const cliente = await Cliente.findOneAndUpdate(
                { rut: String(rut) },
                { 
                    nombre: String(nombre), 
                    email: String(email), 
                    estado: String(estado),
                    direccion: direccion ? String(direccion) : '',
                    comuna: comuna ? String(comuna) : '',
                    provincia: provincia ? String(provincia) : '',
                    region: region ? String(region) : '',
                    fechaNacimiento: fechaNacimiento ? new Date(fechaNacimiento) : null,
                    sexo: sexo ? String(sexo) : '',
                    telefono: telefono ? String(telefono) : ''
                },
                { new: true }
            ).exec();
            
            if (!cliente) throw new Error("Cliente no encontrado");
            
            await Usuario.findOneAndUpdate(
                { rut: String(rut), perfilTipo: 'Cliente' },
                { 
                    nombre: String(nombre), 
                    email: String(email) 
                },
                { new: true }
            ).exec();
            
            return cliente;
        },

        updateEmpleadoCompleto: async (_, { rut, nombre, email, cargo }) => {
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new Error("Email inválido");
            }
            
            if (!nombre || nombre.trim().length < 2) {
                throw new Error("Nombre debe tener al menos 2 caracteres");
            }
            
            if (!cargo || cargo.trim().length < 2) {
                throw new Error("Cargo debe tener al menos 2 caracteres");
            }
            
            const empleado = await Empleado.findOneAndUpdate(
                { rut: String(rut) },
                { 
                    nombre: String(nombre), 
                    email: String(email), 
                    cargo: String(cargo) 
                },
                { new: true }
            ).exec();
            
            if (!empleado) throw new Error("Empleado no encontrado");
            
            await Usuario.findOneAndUpdate(
                { rut: String(rut), perfilTipo: 'Empleado' },
                { 
                    nombre: String(nombre), 
                    email: String(email) 
                },
                { new: true }
            ).exec();
            
            return empleado;
        },

        deleteCliente: async (_, { rut }) => {
            const cliente = await Cliente.findOne({ rut: String(rut) }).exec();
            if (!cliente) throw new Error("Cliente no encontrado");
            
            await Usuario.findOneAndDelete({ 
                rut: String(rut), 
                perfilTipo: 'Cliente' 
            }).exec();
            
            await Cliente.findOneAndDelete({ rut: String(rut) }).exec();
            
            return { status: "200", message: "Cliente eliminado correctamente" };
        },

        deleteEmpleado: async (_, { rut }) => {
            const empleado = await Empleado.findOne({ rut: String(rut) }).exec();
            if (!empleado) throw new Error("Empleado no encontrado");
            
            await Usuario.findOneAndDelete({ 
                rut: String(rut), 
                perfilTipo: 'Empleado' 
            }).exec();
            
            await Empleado.findOneAndDelete({ rut: String(rut) }).exec();
            
            return { status: "200", message: "Empleado eliminado correctamente" };
        },

        crearCupon: async (_, args, { user }) => {
            if (!user || user.perfilTipo !== 'Empleado') {
                throw new Error("Acceso denegado");
            }
            
            const cuponExistente = await Cupon.findOne({ 
                codigo: String(args.codigo).toUpperCase() 
            }).exec();
            
            if (cuponExistente) {
                throw new Error("El código ya existe");
            }
            
            const fechaInicio = new Date(args.fechaInicio);
            const fechaFin = new Date(args.fechaFin);
            
            if (fechaFin <= fechaInicio) {
                throw new Error("La fecha fin debe ser posterior a la fecha inicio");
            }
            
            return await Cupon.create({
                ...args,
                codigo: String(args.codigo).toUpperCase(),
                usosActuales: 0,
                activo: true
            });
        },

        aplicarCupon: async (_, { codigo, clienteId }) => {
            const validacion = await resolvers.Query.validarCupon(null, { 
                codigo: String(codigo), 
                clienteId: String(clienteId) 
            });
            
            if (!validacion.valido) {
                throw new Error(validacion.mensaje);
            }
            
            const carrito = await Carrito.findOne({ clienteId: String(clienteId) }).exec();
            if (!carrito) {
                throw new Error("Carrito no encontrado");
            }
            
            if (carrito.cuponAplicado) {
                throw new Error("Ya tienes un cupón aplicado. Remuévelo primero.");
            }
            
            let descuento = 0;
            if (validacion.cupon.tipo === 'porcentaje') {
                descuento = Math.round(carrito.total * (validacion.cupon.porcentaje / 100));
            } else {
                descuento = validacion.cupon.descuentoFijo || 0;
            }
            
            descuento = Math.min(descuento, carrito.total);
            
            carrito.cuponAplicado = validacion.cupon.codigo;
            carrito.descuento = descuento;
            carrito.totalConDescuento = carrito.total - descuento;
            
            await carrito.save();
            
            return carrito;
        },

        removerCupon: async (_, { clienteId }) => {
            const carrito = await Carrito.findOne({ clienteId: String(clienteId) }).exec();
            if (!carrito) {
                throw new Error("Carrito no encontrado");
            }
            
            if (!carrito.cuponAplicado) {
                throw new Error("No hay cupón aplicado");
            }
            
            carrito.cuponAplicado = null;
            carrito.descuento = 0;
            carrito.totalConDescuento = carrito.total;
            
            await carrito.save();
            
            return carrito;
        },

        deleteCupon: async (_, { id }, { user }) => {
            if (!user || user.perfilTipo !== 'Empleado') {
                throw new Error("Acceso denegado");
            }
            
            const cupon = await Cupon.findById(id).exec();
            if (!cupon) {
                throw new Error("Cupón no encontrado");
            }
            
            await Cupon.findByIdAndDelete(id).exec();
            
            return { status: "200", message: "Cupón eliminado correctamente" };
        },

        confirmarCompra: async (_, { clienteId }) => {
            const cliente = await Cliente.findOne({ rut: String(clienteId) }).exec();
            if (!cliente) throw new Error("Cliente no encontrado");
            if (cliente.estado === 'rechazado') throw new Error("Cliente rechazado no puede realizar compras");

            const carrito = await Carrito.findOne({ clienteId: String(clienteId) }).exec();
            if (!carrito || carrito.items.length === 0)
                throw new Error("Carrito vacío");

            for (const item of carrito.items) {
                const prod = await Producto.findById(item.productoId).exec();
                if (!prod) throw new Error(`Producto ${item.productoId} no encontrado`);
                if (prod.stock < item.cantidad) {
                    throw new Error(`Stock insuficiente para ${prod.nombre}. Disponible: ${prod.stock}, Solicitado: ${item.cantidad}`);
                }
            }

            let total = 0;
            let totalAPagar = carrito.totalConDescuento || carrito.total;
            
            for (const item of carrito.items) {
                const prod = await Producto.findById(item.productoId).exec();
                if (prod) {
                    prod.stock -= item.cantidad;
                    await prod.save();
                    
                    total += prod.precio * item.cantidad;
                }
            }

            const compra = await Compra.create({
                clienteId: String(clienteId),
                total: carrito.total,
                totalPagado: totalAPagar,
                descuentoAplicado: carrito.descuento || 0,
                cuponUsado: carrito.cuponAplicado || null,
                fecha: new Date(),
                items: carrito.items
            });

            if (carrito.cuponAplicado) {
                await Cupon.findOneAndUpdate(
                    { codigo: carrito.cuponAplicado },
                    { $inc: { usosActuales: 1 } }
                ).exec();
            }

            carrito.items = [];
            carrito.total = 0;
            carrito.cuponAplicado = null;
            carrito.descuento = 0;
            carrito.totalConDescuento = 0;
            await carrito.save();

            return {
                id: compra._id.toString(),
                clienteId: compra.clienteId,
                total: compra.total,
                totalPagado: compra.totalPagado,
                descuentoAplicado: compra.descuentoAplicado,
                cuponUsado: compra.cuponUsado,
                fecha: compra.fecha.toISOString(),
                items: compra.items.map(item => ({
                    productoId: item.productoId.toString(),
                    cantidad: item.cantidad
                }))
            };
        }
    }
};

// Apollo server + Express
async function start() {

    const app = express();

    // Headers de seguridad
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    });

    app.use(cors({
        origin: '*',
        credentials: false
    }));

    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: ({ req }) => {
            const auth = req.headers.authorization || "";
            const token = auth.replace("Bearer ", "");

            if (!token || blacklist.has(token)) {
                return { user: null, req };
            }

            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                return { user: decoded, req };
            } catch {
                return { user: null, req };
            }
        },
        // Agregar manejo de errores mejorado
        formatError: (error) => {
            console.error('GraphQL Error:', error);
            return {
                message: error.message,
                locations: error.locations,
                path: error.path
            };
        }
    });

    await server.start();
    server.applyMiddleware({ app, path: "/graphql" });

    const PORT = process.env.PORT || 8092;
    app.listen(PORT, () => {
        console.log(`Servidor GraphQL en puerto ${PORT}`);
    });
}

start();