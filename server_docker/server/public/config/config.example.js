// eslint-disable-next-line
var config =
{
	// roomname / callid
	'democratic' : {
		userAgentString : 'edumeet SIPGW',
		displayName     : 'edumeet SIPGW',
		register        : true,
		mode            : 'democratic', // filmstrip or democratic (default)
		uri             : 'uri@example.com',
		password        : 'password',
		wsServers       : [ 'wss://example.com' ],
		traceSip        : true,
		edumeetHostName : 'example.com',
		edumeetPort     : '4443',
		defaultroom   		: 'testroom', // if X-Room is empty
		turnServers     : [
			{
				urls : [
					'turn:turn.example.com:443?transport=tcp'
				],
				username   : 'example',
				credential : 'example'
			}
		],
		lastN : 4
	},
	'filmstrip' : {
		userAgentString : 'edumeet SIPGW',
		displayName     : 'edumeet SIPGW',
		register        : true,
		mode            : 'filmstrip', // filmstrip or democratic (default)
		uri             : 'uri@example.com',
		password        : 'password',
		wsServers       : [ 'wss://example.com' ],
		traceSip        : true,
		edumeetHostName : 'example.com',
		edumeetPort     : '4443',
		defaultroom   		: 'testroom', // if X-Room is empty
		turnServers     : [
			{
				urls : [
					'turn:turn.example.com:443?transport=tcp'
				],
				username   : 'example',
				credential : 'example'
			}
		],
		lastN : 4
	},
	// fallback
	'default' : {
		userAgentString : 'edumeet SIPGW',
		displayName     : 'edumeet SIPGW',
		register        : true,
		uri             : 'uri@example.com',
		password        : 'password',
		wsServers       : [ 'wss://example.com' ],
		traceSip        : true,
		edumeetHostName : 'example.com',
		edumeetPort     : '4443',
		turnServers     : [
			{
				urls : [
					'turn:turn.example.com:443?transport=tcp'
				],
				username   : 'example',
				credential : 'example'
			}
		],
		lastN : 4

	},
	requestTimeout   : 10000,
	transportOptions :
	{
		tcp : true
	}
};
