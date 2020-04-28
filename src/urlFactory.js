export function getSignalingUrl(peerId, roomId)
{
	const url =
		`wss://${window.config.multipartyHostName}:${window.config.multipartyPort}/?peerId=${peerId}&roomId=${roomId}`;

	return url;
}
