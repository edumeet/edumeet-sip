import { Invitation, SessionState, Session, Info } from "sip.js";
import { SessionDescriptionHandler } from "sip.js/lib/platform/web";
import RoomClient from './RoomClient'
import Logger from './Logger';
import randomString from "random-string";

const logger = new Logger('Session');
const CODE_LENGTH = 5
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const soundFiles: {[key: string]: string} = {
    'conference-pin': '/sounds/conference-pin.wav',
    'invalid-pin': '/sounds/invalid-pin.wav',
    'muted': '/sounds/muted.wav',
    'unmuted': '/sounds/unmuted.wav',
    'joined': '/sounds/notify.mp3'
}

const roomMapping = (window as any).config.roomMapping

export default class EdumeetSession {
    sipSession: Session
    private peerId: string
    private displayName: string
    roomclient?: RoomClient
    private toSipContext: AudioContext
    private toSipDest: MediaStreamAudioDestinationNode
    private toSipTracks: Map<string, {track: MediaStreamTrack, audio: HTMLAudioElement, node: MediaStreamAudioSourceNode}>
    private activeSoundFile?: string
    private soundFiles: {[key: string]: HTMLAudioElement} = {}
    private isJoining: boolean = false
    private isJoined: boolean = false
    private isMuted: boolean = false
    private receivedCharacters: string = ''
    private conferencePinSoundInternal: any
    constructor(sipSession: Invitation) {
        this.peerId = randomString({ length: 8 }).toLowerCase();
        const callerId = sipSession.remoteIdentity.displayName
        this.displayName = callerId ? callerId.slice(0,3)+'xxxx'+callerId.slice(callerId.length-2) : 'Dial-In User'
        this.sipSession = sipSession

        
        sipSession.stateChange.addListener(this.handleStateChange)

        sipSession.delegate = {
            onInfo: this.handleInfo,
        }
        
        this.toSipContext = new AudioContext()
        this.toSipDest = this.toSipContext.createMediaStreamDestination()
        this.toSipTracks = new Map()

        for(let key in soundFiles) {
            this.soundFiles[key] = new Audio(soundFiles[key])
            this.soundFiles[key].onerror = (err) => {
                console.error(err)
            }
            const source = this.toSipContext.createMediaElementSource(this.soundFiles[key]);
            source.connect(this.toSipDest)
        }

        
        setTimeout( () => {
            sipSession.accept({
                sessionDescriptionHandlerOptions: {
                    constraints: {
                        audio: true,
                        video: false,
                        sessionId: sipSession.id
                    },
                }
            })
        }, 10)
    }
    get id() {
        return this.sipSession.id
    }
    getStreamToSip(): MediaStream {
        return this.toSipDest.stream
    }
    get remoteMediaStream(): MediaStream | undefined {
        const sdh = this.sipSession?.sessionDescriptionHandler;
        if (!sdh) {
          return undefined;
        }
        if (!(sdh instanceof SessionDescriptionHandler)) {
          throw new Error("Session description handler not instance of web SessionDescriptionHandler");
        }
        return sdh.remoteMediaStream;
    }
    playSound(key: keyof typeof soundFiles) {
        logger.debug('play sound file %s', key)
        const active = this.activeSoundFile
        if(active) {
            this.soundFiles[active].pause()
            this.soundFiles[active].currentTime = 0
        }
        this.soundFiles[key].play()
        this.activeSoundFile = key as string
    }
    private handleStateChange = async (state: SessionState) => {
        logger.debug("session state change %s", state)
        switch(state) {
            case SessionState.Initial:
                break;
            case SessionState.Establishing:
                break;
            case SessionState.Established:
                await sleep(4000)
                this.playSound('conference-pin')
                this.conferencePinSoundInternal = setInterval( () => {
                    if(this.isJoined || this.isJoining) return
                    this.playSound('conference-pin')
                }, 15000)
                break;
            case SessionState.Terminating:
            case SessionState.Terminated:
                this.close()
                break;
            default:
                throw new Error("Unknown session state.");
        }
    }
    private handleInfo = async (info: Info) => {
        // Invalid content type
        const contentType = info.request.getHeader("content-type");
        if (!contentType || !/^application\/dtmf-relay/i.exec(contentType)) {
          info.reject();
          return;
        }

        // Invalid body
        const body = info.request.body.split("\r\n", 2);
        if (body.length !== 2) {
          info.reject();
          return;
        }

        // Invalid tone
        let tone: string | undefined;
        const toneRegExp = /^(Signal\s*?=\s*?)([0-9A-D#*]{1})(\s)?.*/;
        if (toneRegExp.test(body[0])) {
          tone = body[0].replace(toneRegExp, "$2");
        }
        if (!tone) {
          info.reject();
          return;
        }

        // Invalid duration
        let duration: number | undefined;
        const durationRegExp = /^(Duration\s?=\s?)([0-9]{1,4})(\s)?.*/;
        if (durationRegExp.test(body[1])) {
          duration = parseInt(body[1].replace(durationRegExp, "$2"), 10);
        }
        if (!duration) {
          info.reject();
          return;
        }

        try {
            await info.accept()
            if (!tone || !duration) {
                throw new Error("Tone or duration undefined.");
            }
            this.handleDTMFReceived(tone, duration)
        } catch(err) {
            logger.error(err.message)
        }
    }
    private handleDTMFReceived = (tone: string, duration: number) => {
        logger.warn('received DTMF [tone=%s, duration=%s]', tone, duration)
        if(this.isJoining) return
        if(this.isJoined) {
            if(tone === '0') {
                if(this.isMuted) {
                    this.playSound('unmuted')       
                    this.isMuted = false
                } else {
                    this.playSound('muted')
                    this.isMuted = true
                }
            }
        } else if(tone.match(/^[0-9]$/)) {
            this.receivedCharacters += tone
            if(this.receivedCharacters.length === CODE_LENGTH) {
                this.handleJoin()
            }
        }
    }
    private async handleJoin() {
        this.isJoining = true
        try {
            const roomId = await this.queryRoomId(this.receivedCharacters)
            if(roomId) {
                clearInterval(this.conferencePinSoundInternal)
                this.isJoined = true
                this.connectToRoom(roomId)
                
            } else {
                this.playSound('invalid-pin')
            }
        } catch(err) {
            console.error(err)
        }
        this.receivedCharacters = ''
        this.isJoining = false
    }

    private async queryRoomId(code: string): Promise<string|undefined> {
        // TODO: create an API on the edumeet backend and ask for the corresponding room there
        if(roomMapping[code]) {
            return roomMapping[code]
        } else {
            return undefined
        }
    }

    private async connectToRoom(roomId: string) {
        this.playSound('joined')
        this.roomclient = new RoomClient({
            peerId: this.peerId,
            roomId: roomId,
            displayName: this.displayName,
            onClose: () => {
                this.close()
            },
            onTrackAdded: (track: MediaStreamTrack) => {
                console.log('add track', track)
                const stream = new MediaStream()
                stream.addTrack(track)
             
                // TODO:
                // somehow the following is necessary to make it working
                // can we avoid it?
                const audio = new Audio()
                audio.srcObject = stream
                audio.volume = 0


                const source = this.toSipContext.createMediaStreamSource(stream)
                source.connect(this.toSipDest)

                audio.play();

                this.toSipTracks.set(track.id, {
                    track,
                    audio,
                    node: source
                })
            },
            onTrackRemoved: (track: MediaStreamTrack) => {
                const t = this.toSipTracks.get(track.id)
                if(!t) return
                t.audio.pause()
                t.node.disconnect()
                t.track.stop()
                this.toSipTracks.delete(track.id)
            }   
        })
        
        while(!this.roomclient._joined) {
            // wait for conference to be joined
            await sleep(300)
        }
        const track = this.remoteMediaStream?.getAudioTracks()[0]
        if(!track) {
            throw new Error('could not find remote sip track')
        }
        this.roomclient._enableAudio(track)
    }
    close() {
        this.roomclient?.close()
        for(let t of Array.from(this.toSipTracks.values())) {
            t.audio.pause()
            t.node.disconnect()
            t.track.stop()         
        }
        this.toSipTracks.clear()
    }
}