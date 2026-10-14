import { prisma } from '../db';

export const SETTING_DEFAULTS: Record<string, { value: string; description: string }> = {
  portalName: { value: 'ProHorizon — LOS Stage Management Portal', description: 'Name shown in the portal header.' },
  requireApproval: {
    value: 'true',
    description: 'A submitted configuration must be approved (status APPROVED) before it can be published.',
  },
  makerChecker: {
    value: 'true',
    description: 'The user who approves a version must be different from the user who submitted it.',
  },
  applicationVersionPolicy: {
    value: 'PIN_TO_ORIGINAL',
    description:
      'Customer applications keep the configuration version they started with. Migrating an application to a newer version must be an explicit, authorised operation in the consuming LOS.',
  },
};

export async function getSetting(key: string): Promise<string> {
  const s = await prisma.systemSetting.findUnique({ where: { key } });
  return s?.value ?? SETTING_DEFAULTS[key]?.value ?? '';
}

export async function getBoolSetting(key: string) {
  return (await getSetting(key)) === 'true';
}
