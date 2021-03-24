import domready from 'domready';
import * as transform from 'sdp-transform';
import Logger from './Logger';
import debug from 'debug';
import {
	Registerer,
	UserAgent,
} from 'sip.js';
import Session from './Session'

import './index.css';

if (process.env.REACT_APP_DEBUG === '*' || process.env.NODE_ENV !== 'production')
{
	debug.enable('* -engine* -socket* -RIE* *WARN* *ERROR*');
}

const logger = new Logger();

// Map of Room instances indexed by roomId.
const rooms: Map<string, Session> = new Map();

domready(() =>
{
	logger.debug('DOM ready');

	run();
});


async function run()
{
	logger.debug('run() [environment:%s]', process.env.NODE_ENV);

	navigator.mediaDevices.getUserMedia = async (constraints) => {

		logger.debug('monkey-patched getUserMedia [constraints: "%o"]', constraints);
		const { sessionId } = constraints as any;
		const room = rooms.get(sessionId);
		if(!room) throw new Error('No room created.')
		return room.getStreamToSip()
	};


	const fixModifier = (description: any) => {
		const sdpObj = transform.parse(description.sdp);
		sdpObj.media = sdpObj.media.filter((media) => 
		{
			return media.type === 'audio' ||
				media.type === 'video';
		});
		description.sdp = transform.write(sdpObj);
		description.sdp = description.sdp.replace(/^a=cisco.*?\r\n/img, '');
		return Promise.resolve(description);
	};
	
	const sipConfig = (window as any).config.sip
	const sipUA = new UserAgent({
		userAgentString: sipConfig.userAgentString,
		displayName: sipConfig.displayName,
		uri: UserAgent.makeURI(sipConfig.uri),
		authorizationUsername: sipConfig.username,
		authorizationPassword: sipConfig.password,
		transportOptions : {
			server: sipConfig.server,
			traceSip: sipConfig.traceSip
		},
		sessionDescriptionHandlerFactoryOptions : {
			modifiers :
			[
				fixModifier
			]
		}
	});

	sipUA.delegate = {
		onInvite: (invitation) => {
			logger.debug('Incoming invite [session: %o]', invitation);
			const session = new Session(invitation)
			rooms.set(invitation.id, session)
		},
		onDisconnect: () => {
			for(let room of Array.from(rooms.values())) {
				rooms.delete(room.id)
				room.close()
			}
		},
	}

	await sipUA.start()
	const registerer = new Registerer(sipUA);
	await registerer.register()
}
