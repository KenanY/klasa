const Schema = require('./Schema');
const { resolve } = require('path');
const fs = require('fs-nextra');

class Gateway {

	/**
	 * @typedef  {Object} GatewayOptions
	 * @property {Provider} provider
	 * @property {CacheProvider} cache
	 * @memberof Gateway
	 */

	/**
	 * @param {SettingsCache} store The SettingsCache instance which initiated this instance.
	 * @param {string} type The name of this Gateway.
	 * @param {Function} validateFunction The function that validates the entries' values.
	 * @param {Object} schema The initial schema for this instance.
	 * @param {GatewayOptions} options The options for this schema.
	 */
	constructor(store, type, validateFunction, schema, options) {
		/**
		 * @type {SettingsCache}
		 */
		this.store = store;

		/**
		 * @type {string}
		 */
		this.type = type;

		/**
		 * @type {GatewayOptions}
		 */
		this.options = options;

		/**
		 * @type {Function}
		 */
		this.validate = validateFunction;

		/**
		 * @type {Object}
		 */
		this.defaultSchema = schema;

		/**
		 * @type {Schema}
		 */
		this.schema = null;

		/**
		 * @type {boolean}
		 */
		this.sql = false;
	}

	/**
	 * Inits the table and the schema for its use in this gateway.
	 * @returns {Promise<void[]>}
	 */
	init() {
		return Promise.all([
			this.initSchema().then(schema => { this.schema = new Schema(this.client, this, schema, ''); }),
			this.initTable()
		]);
	}

	/**
	 * Inits the table for its use in this gateway.
	 */
	async initTable() {
		const hasTable = await this.provider.hasTable(this.type);
		if (!hasTable) await this.provider.createTable(this.type);

		const hasCacheTable = await this.cache.hasTable(this.type);
		if (!hasCacheTable) await this.cache.createTable(this.type);

		const data = await this.provider.getAll(this.type);
		if (data.length > 0) {
			for (let i = 0; i < data.length; i++) this.cache.set(this.type, data[i].id, data[i]);
		}
	}

	/**
	 * Inits the schema, creating a file if it does not exist, and returning the current schema or the default.
	 * @returns {Promise<Object>}
	 */
	async initSchema() {
		const baseDir = resolve(this.client.clientBaseDir, 'bwd');
		await fs.ensureDir(baseDir);
		this.filePath = resolve(baseDir, `${this.type}_Schema.json`);
		return fs.readJSON(this.filePath)
			.catch(() => fs.outputJSONAtomic(this.filePath, this.defaultSchema).then(() => this.defaultSchema));
	}

	/**
	 * Get an entry from the cache.
	 * @param {('default'|string)} input The key to get from the cache.
	 * @returns {Object}
	 */
	getEntry(input) {
		if (input === 'default') return this.defaults;
		return this.cache.get(this.type, input) || this.defaults;
	}

	/**
	 * Fetch an entry from the cache. Use this method when using async cacheproviders.
	 * @param {string} input The key to fetch from the cache.
	 * @returns {Promise<Object>}
	 */
	async fetchEntry(input) {
		return this.cache.get(this.type, input) || this.defaults;
	}

	/**
	 * Create a new entry into the database with an optional content (defaults to this Gateway's defaults).
	 * @param {string} input The name of the key to create.
	 * @param {Object} [data={}] The initial data to insert.
	 * @returns {Promise<true>}
	 */
	async createEntry(input, data = this.defaults) {
		const target = await this.validate(input).then(output => output && output.id ? output.id : output);
		await this.provider.create(this.type, target, data);
		await this.cache.create(this.type, target, data);
		return true;
	}

	/**
	 * Delete an entry from the database and cache.
	 * @param {string} input The name of the key to fetch and delete.
	 * @returns {Promise<true>}
	 */
	async deleteEntry(input) {
		await this.provider.delete(this.type, input);
		await this.cache.delete(this.type, input);
		return true;
	}

	/**
	 * Sync either all entries from the configuration, or a single one.
	 * @param {(Object|string)} [input=null] An object containing a id property, like discord.js objects, or a string.
	 * @returns {void}
	 */
	async sync(input = null) {
		if (input === null) {
			const data = await this.provider.getAll(this.type);
			if (data.length > 0) for (let i = 0; i < data.length; i++) this.cache.set(this.type, data[i].id, data[i]);
			return true;
		}
		const target = await this.validate(target).then(output => output && output.id ? output.id : output);
		const data = await this.provider.get(this.type, target);
		await this.cache.set(this.type, target, data);
		return true;
	}

	/**
	 * Reset a value from an entry.
	 * @param {string} target The entry target.
	 * @param {string} key The key to reset.
	 * @param {(Guild|string)} guild A guild resolvable.
	 * @param {boolean} [avoidUnconfigurable=false] Whether the Gateway should avoid configuring the selected key.
	 * @returns {{ value: any, path: SchemaPiece }}
	 */
	async reset(target, key, guild = null, avoidUnconfigurable = false) {
		if (typeof key !== 'string') throw new TypeError('The argument \'key\' for Gateway#reset only accepts strings.');
		guild = this._resolveGuild(guild || target);
		target = await this.validate(target).then(output => output && output.id ? output.id : output);
		const { path, route } = this.getPath(key, avoidUnconfigurable);
		const parsed = await path.parse(path.default, guild);
		const { result } = await this._reset(target, route, parsed);
		await this.provider.update(this.type, target, result);
		return { value: parsed.data, path };
	}

	async _reset(target, route, parsed) {
		let cache = await this.fetchEntry(target);
		const parsedID = parsed && parsed.id ? parsed.id : parsed;
		for (let i = 0; i < route.length; i++) {
			if (typeof cache[route[i]] === 'undefined') cache[route[i]] = {};
			if (i === route.length - 1) cache[route[i]] = parsedID;
			else cache = cache[route[i]];
		}

		return { result: cache, parsedID };
	}

	/**
	 * Update a value from an entry.
	 * @param {string} target The entry target.
	 * @param {string} key The key to modify.
	 * @param {string} value The value to parse and save.
	 * @param {(Guild|string)} guild A guild resolvable.
	 * @param {boolean} [avoidUnconfigurable=false] Whether the Gateway should avoid configuring the selected key.
	 * @returns {{ value: any, path: SchemaPiece }}
	 */
	async updateOne(target, key, value, guild = null, avoidUnconfigurable = false) {
		if (typeof key !== 'string') throw new TypeError('The argument \'key\' for Gateway#updateOne only accepts strings.');
		guild = this._resolveGuild(guild || target);
		target = await this.validate(target).then(output => output && output.id ? output.id : output);
		const { parsed, settings, path } = await this._updateOne(target, key, value, guild, avoidUnconfigurable);
		await this.provider.update(this.type, target, settings);
		return { value: parsed.data, path };
	}

	async _updateOne(target, key, value, guild, avoidUnconfigurable) {
		const { path, route } = this.getPath(key, avoidUnconfigurable);
		if (path.array === true) return this._updateArray(target, 'add', key, value, guild, avoidUnconfigurable);

		const parsed = await path.parse(value, guild);
		const parsedID = parsed.data && parsed.data.id ? parsed.data.id : parsed.data;
		let cache = await this.fetchEntry(target);
		if (cache.default === true) {
			cache = JSON.parse(JSON.stringify(cache));
			delete cache.default;
		}
		const fullObject = cache;

		for (let i = 0; i < route.length - 1; i++) {
			if (typeof cache[route[i]] === 'undefined') cache[route[i]] = {};
			else cache = cache[route[i]];
		}
		cache[route[route.length - 1]] = parsedID;
		await this.cache.set(this.type, target, fullObject);

		return { route, path, result: cache, parsedID, parsed, settings: fullObject };
	}

	/**
	 * Update an array from an entry.
	 * @param {string} target The entry target.
	 * @param {('add'|'remove')} action Whether the value should be added or removed to the array.
	 * @param {string} key The key to modify.
	 * @param {string} value The value to parse and save or remove.
	 * @param {(Guild|string)} guild A guild resolvable.
	 * @param {boolean} [avoidUnconfigurable=false] Whether the Gateway should avoid configuring the selected key.
	 * @returns {{ value: any, path: SchemaPiece }}
	 */
	async updateArray(target, action, key, value, guild = null, avoidUnconfigurable = false) {
		if (typeof key !== 'string') throw new TypeError('The argument \'key\' for Gateway#updateArray only accepts strings.');
		guild = this._resolveGuild(guild || target);
		if (action !== 'add' && action !== 'remove') throw new TypeError('The argument \'action\' for Gateway#updateArray only accepts the strings \'add\' and \'remove\'.');
		target = await this.validate(target).then(output => output && output.id ? output.id : output);
		const { parsed, settings, path } = await this._updateArray(target, action, key, value, guild, avoidUnconfigurable);
		await this.provider.update(this.type, target, settings);
		return { value: parsed.data, path };
	}

	async _updateArray(target, action, key, value, guild, avoidUnconfigurable) {
		const { path, route } = this.getPath(key, avoidUnconfigurable);
		if (path.array === false) throw guild.language.get('COMMAND_CONF_KEY_NOT_ARRAY');

		const parsed = await path.parse(value, guild);
		const parsedID = parsed.data && parsed.data.id ? parsed.data.id : parsed.data;
		let cache = await this.fetchEntry(target);
		if (cache.default === true) {
			cache = JSON.parse(JSON.stringify(cache));
			delete cache.default;
		}
		const fullObject = cache;

		for (let i = 0; i < route.length - 1; i++) {
			if (typeof cache[route[i]] === 'undefined') cache[route[i]] = {};
			cache = cache[route[i]];
		}
		if (action === 'add') {
			if (cache.includes(parsedID)) throw `The value ${parsedID} for the key ${path.path} already exists.`;
			cache.push(parsedID);
		} else {
			const index = cache.indexOf(parsedID);
			if (index === -1) throw `The value ${parsedID} for the key ${path.path} does not exist.`;
			cache.splice(index, 1);
		}

		await this.cache.set(this.type, target, fullObject);

		return { route, path, result: cache, parsedID, parsed, settings: fullObject };
	}

	/**
	 * Resolve a path from a string.
	 * @param {string} [key=null] A string to resolve.
	 * @param {boolean} [avoidUnconfigurable=false] Whether the Gateway should avoid configuring the selected key.
	 * @returns {{ path: SchemaPiece, route: string[] }}
	 */
	getPath(key = null, avoidUnconfigurable = false) {
		if (key === null) return { path, route: [] };
		if (typeof key !== 'string') throw new TypeError('The value for the argument \'key\' must be a string.');
		const route = key.split('.');
		let path = this.schema;

		for (let i = 0; i < route.length; i++) {
			if (path.keys.has(route[i]) === false) throw `The key ${route.slice(0, i).join('.')} does not exist in the current schema.`;
			path = path[route[i]];
		}

		if (path.type === 'Folder') throw `Please, choose one of the following keys: '${Object.keys(path).join('\', \'')}'`;
		if (avoidUnconfigurable === true && path.configurable === false) throw `The key ${path.path} is not configureable in the current schema.`;
		return { path, route };
	}

	_resolveGuild(guild) {
		const constName = guild.constructor.name;
		if (constName === 'Guild') return guild;
		if (constName === 'TextChannel' || constName === 'VoiceChannel' || constName === 'Message' || constName === 'Role') return guild.guild;
		if (typeof guild === 'string' && /^\d{17,19}$/.test(guild)) return this.client.guilds.get(guild);
		return null;
	}

	/**
	 * Get the cache-provider that manages the cache data.
	 * @type {CacheProvider}
	 * @readonly
	 */
	get cache() {
		return this.options.cache;
	}

	/**
	 * Get the provider that manages the persistent data.
	 * @type {Provider}
	 * @readonly
	 */
	get provider() {
		return this.options.provider;
	}

	/**
	 * Get this gateway's defaults.
	 * @type {Object}
	 * @readonly
	 */
	get defaults() {
		return Object.assign(this.schema.defaults, { default: true });
	}

	/**
	 * The client this SettingGateway was created with.
	 * @type {KlasaClient}
	 * @readonly
	 */
	get client() {
		return this.store.client;
	}

	/**
	 * The resolver instance this SettingGateway uses to parse the data.
	 * @type {Resolver}
	 * @readonly
	 */
	get resolver() {
		return this.store.resolver;
	}

}

module.exports = Gateway;
