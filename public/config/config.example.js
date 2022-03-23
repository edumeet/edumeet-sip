// eslint-disable-next-line
var config =
{
	sip : {
		displayName     : 'edumeet SIPGW',
		userAgentString : 'edumeet SIPGW',
		server          : 'wss://10.5.0.1:7443',
		uri             : 'sip:1000@edumeet-sip',
		username        : '1000',
		password        : 'HelloWorld',
		traceSip        : true
	},
	edumeetHostName : 'example.com',
	edumeetPort     : '4443',
	roomMapping     : {
		'00000' : 'test'
	},
	requestTimeout   : 10000,
	transportOptions :
	{
		tcp : true
	},
	lastN : 4
};
