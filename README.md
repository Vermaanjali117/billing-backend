# Cafe Billing Backend

Backend API for a multi-branch café point-of-sale (POS) and inventory management system. Handles order taking, billing, receipt printing, recipe-based stock deduction, and branch-wise inventory tracking.

Built with Node.js, Express, and MongoDB.

## What it does

- Admin and branch-level authentication with JWT
- Multi-branch support — each branch tracks its own stock and orders independently
- Menu items with recipes: each item is linked to the raw materials it consumes, so stock is deducted automatically when an order is placed
- Raw material and branch stock tracking, with a full inventory history log
- Customer records and repeat-customer lookup
- Offers and discounts applied at billing time
- Order creation and billing, with receipt printing support for USB, serial, and network thermal printers
- File uploads such as item images handled with Multer

## Tech used

- Node.js and Express for the server
- MongoDB with Mongoose for the database
- JWT for authentication
- Multer for file uploads
- escpos and node-thermal-printer for receipt printing on thermal printers
- bcryptjs for password hashing

## Project structure

- config/ — DB and app configuration
- middleware/ — Auth and request middleware
- models/ — Admin, Branch, BranchStock, Counter, Customers, InventoryHistory, Item, Offer, Order, Recipe, RawMaterial
- routes/ — Auth, Customer, Items, Offer, Orders, Recipe, RawMaterial
- public/ — Static assets
- uploads/ — Uploaded files
- server.js — App entry point

## Running it locally

You'll need Node.js and MongoDB installed.

- Clone the repo and run npm install
- Create a .env file in the root folder with PORT, MONGO_URI, and JWT_SECRET
- Run npm start

## API routes

- /api/auth — admin/branch login and authentication
- /api/customers — create and look up customers
- /api/items — manage menu items
- /api/offers — manage discounts and offers
- /api/orders — create orders and generate bills
- /api/recipes — manage item-to-raw-material recipes
- /api/raw-materials — manage raw material stock

## What's next

- Sales and inventory reporting dashboard
- Automated tests
- Deployment guide

## Author

Anjali Verma — [GitHub](https://github.com/Vermaanjali117)
