import { container } from 'tsyringe'
import { setupCodeToken } from './applications/ports/setup-code.port'
import type { ISetupCode } from './applications/ports/setup-code.port'
import { GetSetupStatusUseCase } from './applications/usecases/get-setup-status.usecase'

/** At start-up, a shop with nobody in it gets a setup code, printed where only the person running the server looks. */
export async function announceSetupCode() {
  const { needsSetup } = await container.resolve(GetSetupStatusUseCase).execute()
  if (!needsSetup) return

  const code = container.resolve<ISetupCode>(setupCodeToken).issue()
  const line = '='.repeat(60)
  console.log(
    `\n${line}\n EasyPOS: ร้านนี้ยังไม่ได้ตั้งค่า (first-run setup)\n SETUP CODE / รหัสตั้งค่า:  ${code}\n เปิดเว็บแล้วกรอกรหัสนี้ที่หน้าตั้งค่าครั้งแรก\n${line}\n`,
  )
}
