const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../src/db');

const SECRET_KEY = 'sua_chave_secreta'; // pode usar .env

// Cadastro
router.post('/register', async (req,res)=>{
  const {name, phone, password} = req.body;
  if(!name || !phone || !password) return res.status(400).json({error:'Todos os campos são obrigatórios'});
  try{
    const db = await getDb();
    const hashed = await bcrypt.hash(password,10);
    await db.run('INSERT INTO customers(name, phone, password) VALUES($1,$2,$3)', [name, phone, hashed]);
    res.json({success:true});
  }catch(err){
    if(err.message.includes('unique')) return res.status(400).json({error:'Telefone já cadastrado'});
    console.error(err);
    res.status(500).json({error:'Erro ao cadastrar'});
  }
});

// Login
router.post('/login', async (req,res)=>{
  const {phone, password} = req.body;
  if(!phone || !password) return res.status(400).json({error:'Todos os campos são obrigatórios'});
  try{
    const db = await getDb();
    const user = await db.get('SELECT * FROM customers WHERE phone=$1',[phone]);
    if(!user) return res.status(401).json({error:'Cliente não encontrado'});
    const valid = await bcrypt.compare(password, user.password);
    if(!valid) return res.status(401).json({error:'Senha incorreta'});

    const token = jwt.sign({id:user.id, name:user.name}, SECRET_KEY, {expiresIn:'8h'});
    res.json({token});
  }catch(err){
    console.error(err);
    res.status(500).json({error:'Erro ao autenticar'});
  }
});

module.exports = router;
