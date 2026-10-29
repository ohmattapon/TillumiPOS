import { container } from 'tsyringe'
import { DiskUpdateStaging } from './adapters/staging/update-staging.adapter'
import { HttpUpdateDownloader } from './adapters/download/update-downloader.adapter'
import { HttpUpdateFeed } from './adapters/feed/update-feed.adapter'
import { NodeUpdateHasher } from './adapters/hash/update-hasher.adapter'
import { NodeUpdateSignatureVerifier } from './adapters/signature/update-signature-verifier.adapter'
import { UpdateElysiaController } from './adapters/controllers/update.controller'
import { updateDownloaderToken } from './applications/ports/update-downloader.port'
import { updateFeedToken } from './applications/ports/update-feed.port'
import { updateHasherToken } from './applications/ports/update-hasher.port'
import { updateSignatureVerifierToken } from './applications/ports/update-signature.port'
import { updateStagingToken } from './applications/ports/update-staging.port'
import { ApplyUpdateUseCase } from './applications/usecases/apply-update.usecase'
import { CheckUpdateUseCase } from './applications/usecases/check-update.usecase'

container.register(updateFeedToken, { useClass: HttpUpdateFeed })
container.register(updateDownloaderToken, { useClass: HttpUpdateDownloader })
container.register(updateHasherToken, { useClass: NodeUpdateHasher })
container.register(updateSignatureVerifierToken, { useFactory: () => new NodeUpdateSignatureVerifier() })
container.register(updateStagingToken, { useFactory: () => new DiskUpdateStaging() })
container.registerSingleton(CheckUpdateUseCase)
container.registerSingleton(ApplyUpdateUseCase)
container.registerSingleton(UpdateElysiaController)
