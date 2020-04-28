// eslint-disable-next-line
var config =
{
	userAgentString    : 'Multiparty-meeting SIPGW',
	displayName        : 'Multiparty-meeting SIPGW',
	register           : true,
	uri                : 'uri@example.com',
	password           : 'password',
	wsServers          : [ 'wss://example.com' ],
	traceSip           : true,
	multipartyHostName : 'example.com',
	multipartyPort     : '4443',
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
