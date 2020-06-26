// eslint-disable-next-line
var config =
{
	userAgentString    : 'edumeet SIPGW',
	displayName        : 'edumeet SIPGW',
	register           : true,
	uri                : 'uri@example.com',
	password           : 'password',
	wsServers          : [ 'wss://example.com' ],
	traceSip           : true,
	edumeetHostName : 'example.com',
	edumeetPort     : '4443',
	turnServers        : [
		{
			urls : [
				'turn:turn.example.com:443?transport=tcp'
			],
			username   : 'example',
			credential : 'example'
		}
	],
	requestTimeout   : 10000,
	transportOptions :
	{
		tcp : true
	},
	lastN : 4
};
