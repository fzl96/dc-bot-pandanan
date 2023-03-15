import {
  REST,
  Routes,
  GatewayIntentBits,
  Client,
  ApplicationCommandOptionType,
} from "discord.js";
import { Configuration, OpenAIApi } from "openai";
import dotenv from "dotenv";

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const configuration = new Configuration({
  organization: "org-VPRwtAION8EMQVaEsIUXvZno",
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const commands = [
  {
    name: "ping",
    description: "Replies with Pong!",
  },
  {
    name: "chatgpt",
    description: "Replies with chatGPT's answer",
    options: [
      {
        name: "prompt",
        description: "The question to ask chatGPT",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
];

const rest = new REST({ version: "9" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.on("ready", () => {
  console.log(`Logged in as ${client.user ? client.user.tag : ""}!`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === "ping") {
    await interaction.reply("Pong!");
  } else if (commandName === "chatgpt") {
    // get the option
    const question = await interaction.options.get("prompt")?.value;
    const user = await interaction.user;
    await interaction.deferReply();

    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {"role": "user", "content": question as string},
    ]
    });
    await interaction.followUp({
      content: `${question} by ${user} : ${completion.data.choices[0].message.content}`,
    });
  }
});

client.login(TOKEN);
