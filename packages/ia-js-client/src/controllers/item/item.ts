import { MetadataService, Metadata } from '../../services/metadata'
import { RelatedService, Related } from '../../services/related'
import { DetailsService, DetailsResponse } from '../../services/details'
const debug = require('debug')('ia-js-client:item');

/**
 * early prototype of audio file class (will change)
 */
export class AudioFile {
  name: string
  length: number
  track: string
  artist: string
  sources: Array<{
    file: string
    type: string // eg mp3
    height: string | number
    width: string | number
  }>
  waveformUrl: string
  youtubeId: string
  spotifyId: string

  constructor(file?: any) {
    if (file) this.setFromFile(file)
  }

  setFromFile (file:any) {
    // debug(file)

    this.name = file.title
    this.track = file.track
    this.length = file.length
    this.artist = file.artist || ''

    let externalIdentifiers: Array<string> = []
    switch (typeof file['external-identifier']) {
      case 'string':
        externalIdentifiers.push(file['external-identifier'])
        break
      case 'object':
        externalIdentifiers.push(...file['external-identifier'])
        break
    }

    externalIdentifiers.forEach((id) => {
      if (id.indexOf('urn:youtube') === 0) {
        this.youtubeId = id.replace('urn:youtube:', '')
      } else if (id.indexOf('urn:spotify') === 0) {
        this.spotifyId = id.replace('urn:spotify:track:', '')
      }
    })
  }
}

// Maybe this would abstract a bunch of services
// Using async in most functions, means it might have different strategies
// for fetching data.

export class Item {
  readonly identifier: string

  private metadataCache: Metadata
  private relatedCache:Related
  private detailsDataCache: DetailsResponse | null

  constructor(identifier:string, metadata?:Metadata, related?:Related) {
    this.identifier = identifier
    this.metadataCache = metadata
    this.relatedCache = related
    this.detailsDataCache = null
  }

  public async getMetadata(): Promise<Metadata> {
    // Can throw error if metadata call fails -
    //TODO-ERRORS callers I've found dont appear to be checking for it

    if (this.metadataCache) {
      return (this.metadataCache)
    } else {
      try {
        let metadataService = new MetadataService()
        this.metadataCache = await metadataService.get({ identifier: this.identifier }) // Can throw error if metadata fails
        return (this.metadataCache);
      } catch (err) {
        debug("Failed to retrieve metadata for %s", this.identifier);
        throw (err);
      }
    }
  }

  public async getMetadataField(field: string, safe: boolean): Promise<Array<any> | null> {
    // Can throw error if metadata call fails -
    // TODO-ERRORS only current caller I've found doesnt check for the reject anyway
    // Also .... it looks like if not very careful this is going to lead to multiple parallel calls to metadata API - it would be much better IMHO to explicitly call getMetadata then access the fields
    let md = await this.getMetadata(); // Throws error if call fails, causing this to throw error
    let value = md.data.metadata[field] || null
    if (!value && safe) {
      value = [null]
    }
    return (md.data[field] || value)
  }

  public async getRelated ():Promise<Related> { //TODO-PROMISES I think getMetadata and getRelated has an unneccessary promise wrapping
    return new Promise<Related>(async (resolve, reject) => {
      if (this.relatedCache) {
        resolve(this.relatedCache)
      } else {
        let relatedService = new RelatedService()
        this.relatedCache = await relatedService.get({identifier: this.identifier})
        resolve(this.relatedCache)
      }
    })
  }

  public async getDetailsData(): Promise<DetailsResponse> {
    if (this.detailsDataCache) {
      return (this.detailsDataCache)
    } else {
      let detailsService = new DetailsService()
      // TODO-ERRORS Note "get" can fail if metadata fails, should check or this call can fail.
      this.detailsDataCache = await detailsService.get({ identifier: this.identifier })
      return (this.detailsDataCache)
    }
  }

  public async getAudioTracks(): Promise<Array<AudioFile>> {
    let metadata = await this.getMetadata()
    let detailsResponse = await this.getDetailsData()

    // TODO
    let audioFiles = []
    if (detailsResponse.jwInitData) {
      debug(detailsResponse.jwInitData)
      // parse the audio files
      detailsResponse.jwInitData.forEach(jwRow => {
        let file = metadata.data.files.reduce((carry, file) => {
          if (carry)
            return carry
          if (file.name == jwRow.orig) {
            return file
          }
        }, null)

        let audioFile = new AudioFile(file)


        audioFile.name = jwRow.title.replace(/^(\d+\. )/, '')
        audioFile.waveformUrl = jwRow.image
        audioFile.length = jwRow.duration
        debug('setting sources')
        audioFile.sources = jwRow.sources

        // TODO get youtubeId and spotifyId  from metadata files
        // youtubeId:string
        // spotifyId:string

        audioFiles.push(audioFile)
      })
    }

    return (audioFiles)
  }
}