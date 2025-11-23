const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { ApolloServer, gql } = require('apollo-server-express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Modelos
const Usuario = require('./models/usuario');
const Cliente = require('./models/cliente');
const Empleado = require('./models/empleado');
const Producto = require('./models/producto');
const Carrito = require('./models/carrito');
const Compra = require('./models/compra'); 
const Reembolso = require('./models/reembolso');

// Conexion MongoDB
mongoose.connect("mongodb://localhost:27017/naturalpower")
    .then(() => console.log("MongoDB conectado"))
    .catch((err) => console.error("Error MongoDB:", err));

// Configuracion JWT
const JWT_SECRET = process.env.JWT_SECRET || "CAMBIA_ESTA_CLAVE_A_UNA_SEGURA";
const TOKEN_EXPIRES = "8h";

// Blacklist en memoria
const blacklist = new Set();


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

    type Cliente {
        id: ID!
        rut: String!
        nombre: String!
        email: String!
        pass: String!
        estado: String!
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
    }

    type Compra {
        id: ID!
        clienteId: String!
        total: Int!
        fecha: String!
        items: [ItemCarrito]!
    }

    type Reembolso {
        id: ID!
        compraId: String!
        motivo: String!
        estado: String!
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
    }

    # MUTATIONS
    type Mutation {

        login(email: String!, pass: String!): AuthPayload
        logout(token: String!): Response
        resetPassword(email: String!, newPass: String!): Response

        addUsuario(nombre: String!, email: String!, pass: String!, rut: String!, perfilTipo: String!): Usuario

        addCliente(rut: String!, nombre: String!, email: String!, pass: String!): Cliente
        updateClienteCompleto(rut: String!, nombre: String!, email: String!, estado: String!): Cliente
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

        getCompraByCliente: (_, { rut }) =>
            Compra.find({ clienteId: rut }).sort({ fecha: -1 }).exec(),

        getCompras: (_, __, { user }) => {
            if (!user || user.perfilTipo !== 'Empleado')
                throw new Error("Acceso denegado");
            return Compra.find().sort({ fecha: -1 }).exec();
        },

        getComprasDelDia: async (_, __, { user }) => {
            if (!user || user.perfilTipo !== 'Empleado')
                throw new Error("Acceso denegado");

            const now = new Date();
            const inicio = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const fin = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

            return Compra.find({ 
                fecha: { $gte: inicio, $lt: fin } 
            }).sort({ fecha: 1 }).exec();
        },

        getReembolsos: () => Reembolso.find().exec()
    },

    Mutation: {

        login: async (_, { email, pass }) => {
            const usuario = await Usuario.findOne({ email }).populate("perfil").exec();
            if (!usuario) throw new Error("Credenciales incorrectas");

            let ok = false;
            if (usuario.pass.startsWith("$2")) ok = await bcrypt.compare(pass, usuario.pass);
            else ok = (usuario.pass === pass);

            if (!ok) throw new Error("Credenciales incorrectas");

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
            const hashed = await bcrypt.hash(args.pass, 10);
            
            const cliente = await Cliente.create({
                rut: args.rut,
                nombre: args.nombre,
                email: args.email,
                pass: hashed,
                estado: 'pendiente'
            });
            
            await Usuario.create({
                nombre: args.nombre,
                email: args.email,
                pass: hashed,
                rut: args.rut,
                perfilTipo: 'Cliente',
                perfil: cliente._id
            });
            
            return cliente;
        },

        addEmpleado: async (_, args) => {
            const hashed = await bcrypt.hash(args.pass, 10);
            
            const empleado = await Empleado.create({
                rut: args.rut,
                nombre: args.nombre,
                email: args.email,
                pass: hashed,
                cargo: args.cargo
            });
            
            await Usuario.create({
                nombre: args.nombre,
                email: args.email,
                pass: hashed,
                rut: args.rut,
                perfilTipo: 'Empleado',
                perfil: empleado._id
            });
            
            return empleado;
        },

        addProducto: (_, args) => Producto.create(args),

        updateProducto: (_, { id, ...rest }) =>
            Producto.findByIdAndUpdate(id, rest, { new: true }).exec(),

        deleteProducto: async (_, { id }) => {
            await Producto.findByIdAndDelete(id).exec();
            return { status: "200", message: "Producto eliminado" };
        },

        crearCarrito: async (_, { clienteId }) => {
            return Carrito.findOneAndUpdate(
                { clienteId },
                { $setOnInsert: { items: [], total: 0 } },
                { upsert: true, new: true }
            ).exec();
        },

        agregarItemCarrito: async (_, { clienteId, productoId, cantidad }) => {
            if (cantidad < 1) {
                throw new Error("La cantidad debe ser al menos 1");
            }

            let carrito = await Carrito.findOne({ clienteId }).exec();
            
            if (!carrito) {
                carrito = await Carrito.create({ 
                    clienteId, 
                    items: [], 
                    total: 0 
                });
            }

            const producto = await Producto.findById(productoId).exec();
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
                carrito.items.push({ productoId, cantidad });
            }

            await carrito.save();
            return carrito;
        },

        confirmarCompra: async (_, { clienteId }) => {
            const cliente = await Cliente.findOne({ rut: clienteId }).exec();
            if (!cliente) throw new Error("Cliente no encontrado");
            if (cliente.estado === 'rechazado') throw new Error("Cliente rechazado no puede realizar compras");

            const carrito = await Carrito.findOne({ clienteId }).exec();
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
            
            for (const item of carrito.items) {
                const prod = await Producto.findById(item.productoId).exec();
                if (prod) {
                    // Restar del stock
                    prod.stock -= item.cantidad;
                    await prod.save();
                    
                    total += prod.precio * item.cantidad;
                }
            }

            const compra = await Compra.create({
                clienteId,
                total,
                fecha: new Date(),
                items: carrito.items
            });

            carrito.items = [];
            carrito.total = 0;
            await carrito.save();

            return compra;
        },

        solicitarReembolso: (_, args) =>
            Reembolso.create({ ...args, estado: "Pendiente" }),

        atenderReembolso: (_, { id, estado }) =>
            Reembolso.findByIdAndUpdate(id, { estado }, { new: true }).exec(),

        resetPassword: async (_, { email, newPass }) => {
            const usuario = await Usuario.findOne({ email }).exec();
            if (!usuario)
                return { status: "404", message: "Usuario no encontrado" };

            const hashed = await bcrypt.hash(newPass, 10);
            usuario.pass = hashed;
            await usuario.save();

            return { status: "200", message: "Contraseña actualizada" };
        },

        updateCliente: async (_, { rut, estado }) => {
            const cliente = await Cliente.findOneAndUpdate(
                { rut },
                { estado },
                { new: true }
            ).exec();
            if (!cliente) throw new Error("Cliente no encontrado");
            return cliente;
        },

        updateClienteCompleto: async (_, { rut, nombre, email, estado }) => {
            const cliente = await Cliente.findOneAndUpdate(
                { rut },
                { nombre, email, estado },
                { new: true }
            ).exec();
            
            if (!cliente) throw new Error("Cliente no encontrado");
            
            await Usuario.findOneAndUpdate(
                { rut, perfilTipo: 'Cliente' },
                { nombre, email },
                { new: true }
            ).exec();
            
            return cliente;
        },

        updateEmpleadoCompleto: async (_, { rut, nombre, email, cargo }) => {
            const empleado = await Empleado.findOneAndUpdate(
                { rut },
                { nombre, email, cargo },
                { new: true }
            ).exec();
            
            if (!empleado) throw new Error("Empleado no encontrado");
            
            await Usuario.findOneAndUpdate(
                { rut, perfilTipo: 'Empleado' },
                { nombre, email },
                { new: true }
            ).exec();
            
            return empleado;
        },

        deleteCliente: async (_, { rut }) => {
            const cliente = await Cliente.findOne({ rut }).exec();
            if (!cliente) throw new Error("Cliente no encontrado");
            
            await Usuario.findOneAndDelete({ 
                rut, 
                perfilTipo: 'Cliente' 
            }).exec();
            
            await Cliente.findOneAndDelete({ rut }).exec();
            
            return { status: "200", message: "Cliente eliminado correctamente" };
        },

        deleteEmpleado: async (_, { rut }) => {
            const empleado = await Empleado.findOne({ rut }).exec();
            if (!empleado) throw new Error("Empleado no encontrado");
            
            await Usuario.findOneAndDelete({ 
                rut, 
                perfilTipo: 'Empleado' 
            }).exec();
            
            await Empleado.findOneAndDelete({ rut }).exec();
            
            return { status: "200", message: "Empleado eliminado correctamente" };
        }
    }
};

// Apollo server + Express
async function start() {

    const app = express();

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
                return { user: null };
            }

            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                return { user: decoded };
            } catch {
                return { user: null };
            }
        }
    });

    await server.start();
    server.applyMiddleware({ app, path: "/graphql" });

    app.listen(8092, () => {
        console.log("Servidor GraphQL en puerto 8092");
    });
}

start();