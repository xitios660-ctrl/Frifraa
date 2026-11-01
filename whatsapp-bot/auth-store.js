'use strict';
const crypto = require('node:crypto');
const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');

const SALT = 'bomba-party-wa-auth-v1';
function makeCrypto(secret) {
  if (!secret || secret.length < 24) throw new Error('SESSION_SECRET precisa de ao menos 24 caracteres.');
  const key = crypto.scryptSync(secret, SALT, 32);
  return {
    encrypt(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(Buffer.from(value, 'utf8')), cipher.final()]);
      return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
    },
    decrypt(value) {
      const [iv, tag, text] = String(value).split('.');
      if (!iv || !tag || !text) throw new Error('Dados de sessão inválidos.');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(text, 'base64')), decipher.final()]).toString('utf8');
    }
  };
}

function createAuthStore(db, secret) {
  const codec = makeCrypto(secret);
  const coll = db.collection('whatsapp_auth');
  let credentials;
  let pending = Promise.resolve();
  const serialize = value => JSON.stringify(value, BufferJSON.replacer);
  const deserialize = value => JSON.parse(value, BufferJSON.reviver);
  const recordKey = (type, id) => type + ':' + id;
  function queueWrite(op) {
    const result = pending.then(op);
    pending = result.catch(() => {});
    return result;
  }
  async function initialize() {
    const rec = await coll.findOne({ _id: 'creds' });
    credentials = rec ? deserialize(codec.decrypt(rec.data)) : initAuthCreds();
    return {
      state: {
        creds: credentials,
        keys: {
          async get(type, ids) {
            if (!ids.length) return {};
            const rows = await coll.find({ _id: { $in: ids.map(id => recordKey(type, id)) } }).toArray();
            const result = {};
            for (const row of rows) {
              let value = deserialize(codec.decrypt(row.data));
              if (type === 'app-state-sync-key' && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
              result[row._id.slice(type.length + 1)] = value;
            }
            return result;
          },
          async set(data) {
            await queueWrite(async () => {
              const ops = [];
              for (const [type, entries] of Object.entries(data)) {
                for (const [id, value] of Object.entries(entries)) {
                  const _id = recordKey(type, id);
                  if (value == null) ops.push({ deleteOne: { filter: { _id } } });
                  else ops.push({ updateOne: { filter: { _id }, update: { $set: { data: codec.encrypt(serialize(value)), updatedAt: new Date() } }, upsert: true } });
                }
              }
              if (ops.length) await coll.bulkWrite(ops, { ordered: true });
            });
          }
        }
      },
      saveCreds: async () => queueWrite(() => coll.updateOne({ _id: 'creds' }, { $set: { data: codec.encrypt(serialize(credentials)), updatedAt: new Date() } }, { upsert: true }))
    };
  }
  return { initialize, codec };
}
module.exports = { makeCrypto, createAuthStore };
