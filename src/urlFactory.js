export function getSignalingUrl(peerId, roomId)
{
	const url =
		`wss://${window.config.edumeetHostName}:${window.config.edumeetPort}/?peerId=${peerId}&roomId=${roomId}`;

	return url;
}
