import { useCallback, useState } from "react"
import type { ProviderSettings } from "@roo-code/types"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { validateApiConfiguration } from "@src/utils/validate"
import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Button } from "@src/components/ui"
import ApiOptions from "../settings/ApiOptions"
import { Tab, TabContent } from "../common/Tab"
import RooHero from "./RooHero"
import { Trans } from "react-i18next"

const WelcomeViewProvider = () => {
	const { apiConfiguration, currentApiConfigName, setApiConfiguration, uriScheme } = useExtensionState()
	const { t } = useAppTranslation()
	const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

	const setApiConfigurationFieldForApiOptions = useCallback(
		(field: keyof ProviderSettings, value: any) => {
			setApiConfiguration({
				...(apiConfiguration || {}),
				[field]: value,
			})
		},
		[setApiConfiguration, apiConfiguration],
	)

	const handleGetStarted = useCallback(() => {
		const error = apiConfiguration ? validateApiConfiguration(apiConfiguration) : undefined
		if (error) {
			setErrorMessage(error)
			return
		}
		setErrorMessage(undefined)
		vscode.postMessage({ type: "upsertApiConfiguration", text: currentApiConfigName, apiConfiguration })
	}, [apiConfiguration, currentApiConfigName])

	return (
		<Tab>
			<TabContent className="flex flex-col gap-4 p-6 justify-center">
				<RooHero />
				<h2 className="mt-0 mb-0 text-xl">{t("welcome:greeting")}</h2>
				<div className="text-base text-vscode-foreground space-y-3">
					<p><Trans i18nKey="welcome:introduction" /></p>
					<p><Trans i18nKey="welcome:chooseProvider" /></p>
				</div>
				<div className="mb-4">
					<ApiOptions
						fromWelcomeView
						apiConfiguration={apiConfiguration || {}}
						uriScheme={uriScheme}
						setApiConfigurationField={setApiConfigurationFieldForApiOptions}
						errorMessage={errorMessage}
						setErrorMessage={setErrorMessage}
					/>
				</div>
				<div className="-mt-8">
					<Button onClick={handleGetStarted} variant="primary">
						{t("welcome:providerSignup.getStarted")} →
					</Button>
				</div>
			</TabContent>
		</Tab>
	)
}

export default WelcomeViewProvider
