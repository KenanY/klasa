# SettingGateway

The SettingGateway is designed to provide users a very useful interface for managing data. Each instance is able to handle a completely different schema and database.

By default, Klasa uses the [json](https://github.com/dirigeants/klasa/blob/master/src/providers/json.js) provider. Do not be fooled and insta-replace with SQLite, Klasa's JSON provider writes the data [atomically](https://en.wikipedia.org/wiki/Atomicity_(database_systems)), in other words, it is very rare for the data to corrupt.

However, as Klasa works on a [NoSQL](https://en.wikipedia.org/wiki/NoSQL) environment, however, SQL parsing has been improved to reduce the NoSQL middleware processing and be able to match it in performance's speed. SQL providers also need a special set of methods and properties to make the provider {@link SQL} compatible.

## Change the *provider's engine*.

For example, let's say I have downloaded the *levelup* provider and I want to work with it, then we go to your main script file (`app.js`, `bot.js`..., wherever you declare the new Klasa.Client), and write the following code:
```javascript
provider: { engine: 'levelup' }
```

Your Klasa's configuration will look something like this:

```javascript
const client = new Klasa.Client({
  ownerID: '',
  prefix: 'k!',
  clientOptions: {},
  provider: { engine: '' },
});

client.login('A_BEAUTIFUL_TOKEN_AINT_IT?');
```

And now, you're using levelup's provider to store the data from SettingGateway.

What happens when I use an engine that does not exist as a provider? Simply, SettingGateway will throw an error, it is enough user-friendly and readable, if that happens, make sure you wrote the provider's name correctly.

## Add new 'keys' to the guild settings.

You can easily add keys to the schema by doing this:

```javascript
client.settings.guilds.schema.addKey(key, options, force?);
```

Where:
- `key` is the key's name to add, `String` type.
- `options` is an object containing the options for the key, such as `type`, `default`, `sql`, `array`...
- `force` (defaults to `true`) is whether SchemaManager should update all documents/rows to match the new schema, using the `options.default` value.

For example, let's say I want to add a new settings key, called `modlogs`, which takes a channel.

```javascript
client.settings.guilds.schema.addKey('modlogs', { type: 'TextChannel' });
```

This will create a new settings key, called `modlogs`, and will take a `TextChannel` type.

> The force parameter defaults to `true` instead to `false`. It is also recommended to use it as it can avoid certain unwanted actions.

But now, I want to add another key, with name of `users`, *so I can set a list of blacklisted users who won't be able to use commands*, which will take an array of Users.

```javascript
client.settings.guilds.schema.addKey('users', { type: 'User', array: true });
```

> `options.array` defaults to `false`, and when `options.default` is not specified, it defaults to `null`, however, when `options.array` is `true`, `options.default` defaults to `[]` (empty array).

What have we done? `client.settings.guilds.schema` is a **Schema** instance (also called Folder type) which can manage itself, such as adding keys/folders to itself (it certainly follows the OOP paradigm).

## Editing keys from the guild settings.

Now that I have a new key called `modlogs`, I want to configure it outside the `conf` command, how can we do this?

```javascript
client.settings.guilds.updateOne(msg.guild, 'modlogs', '267727088465739778');
```

Check: {@link Gateway.updateOne}

> You can use a Channel instance, {@link SettingResolver} will make sure the input is valid and the database gets an **ID** and not an object.

Now, I want to **add** a new user user to the `users` key, which takes an array.

```javascript
client.settings.guilds.updateArray(msg.guild, 'add', 'users', '146048938242211840');
```

That will add the user `'146048938242211840'` to the `users` array. To remove it:

```javascript
client.settings.guilds.updateArray(msg.guild, 'remove', 'users', '146048938242211840');
```

Check: {@link Gateway.updateArray}

## Removing a key from the guild settings.

I have a key which is useless for me, so I *want* to remove it from the schema.

```javascript
client.settings.guilds.schema.removeKey('users');
```

## Create a new folder to the schema

It's very similar to how you create a new key into it, but it only accepts three arguments:

```javascript
client.settings.guilds.schema.addFolder(name, object, force);
```

So, let's say I want a key called 'modlogs' into the 'channels' folder for organization. There are two ways to do it:

### Slower

```javascript
async function() {
	await client.settings.guilds.schema.addFolder('channels');
	await client.settings.guilds.channels.addKey('modlogs', { type: 'TextChannel' });
	console.log(client.settings.guilds.channels.modlogs.toJSON());
	// {
	//  	type: 'textchannel',
	//  	array: false,
	//  	default: null,
	//  	min: null,
	//  	max: null,
	//  	configurable: true
	// }
}
```

### Faster

```javascript
async function() {
	await client.settings.guilds.schema.addFolder('channels', { modlogs: { type: 'TextChannel' } });
	console.log(client.settings.guilds.channels.modlogs.toJSON());
	// {
	//  	type: 'textchannel',
	//  	array: false,
	//  	default: null,
	//  	min: null,
	//  	max: null,
	//  	configurable: true
	// }
}
```

Now, how we do configure it with the built-in conf command? Easy:

```
k!conf set channels.modlogs #modlogs
```

## Add a key to the guild settings if it doesn't exist.

In [Klasa-Pieces](https://github.com/dirigeants/klasa-pieces/), specially, some pieces require a key from the settings to work, however, the creator of the pieces does not know if the user who downloads the piece has it, so this function becomes is useful in this case.

```javascript
async function() {
	if (!client.settings.guilds.schema.keys.has('modlog')) {
		await client.settings.guilds.schema.addKey('modlog', { type: 'TextChannel' });
	}
}
```

## How can I create new Gateway instances?

By using {@link SettingsCache}, (available from `client.settings`).

Let's say I want to add a new Gateway instance, called `users`, which input takes users, and stores a quote which is a string between 2 and 140 characters.

```javascript
async function validate(resolver, user) {
	const result = await resolver.user(user);
	if (!result) throw 'The parameter <User> expects either a User ID or a User Object.';
	return result;
}

const schema = {
	quote: {
		type: 'String',
		default: null,
		array: false,
		min: 2,
		max: 140
  	}
};

client.settings.add('users', validate, schema);
```

> The `validate` function must be a [**function**](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/function), not a [**Arrow Function**](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Functions/Arrow_functions), the difference between them is that an arrow function binds `this` to wherever the function has been created (for example, the `exports` from your eval command, if you are doing this with eval), while the normal functions does not do this.

> If the `validate` function does not resolve **Guild** type, you might want to use the fourth argument of `Gateway#updateOne` (third in Gateway#updateMany), which takes a Guild resolvable.

And then, you can access to it by:

```javascript
client.settings.users;
```

## Using different providers in different gateways

This is new from the SettingGateway v2 (check [#43](https://github.com/dirigeants/klasa/pull/43)), when creating a new Gateway (check above for how to do it), there's an extra parameter in `client.settings.add` called `options`. It's optional, but it accepts an object with two keys: `cache` and `provider`, being the names of the desired CacheProvider (Collection, Redis...) or/and Provider/SQLProvider (json, leveldb, rethinkdb...). For example:

```javascript
client.settings.add('users', validate, schema, { provider: 'rethinkdb', cache: 'redis' });
```

The code above will create a new Gateway instance called 'users', which will use RethinkDB to store the persistent data, and Redis to cache it.