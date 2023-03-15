import {
  REST,
  Routes,
  GatewayIntentBits,
  Client,
  ApplicationCommandOptionType,
} from "discord.js";
import { Configuration, OpenAIApi } from "openai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const configuration = new Configuration({
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

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
})();

client.on("ready", () => {
  console.log(`Logged in as ${client.user ? client.user.tag : ""}!`);
}); 

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "ping") {
    const user = await interaction.user;
    const userId = user.id;
    
    fs.readFile("history.json", "utf8", function (err, data) {
      if (err) throw err;
      const commandHistory = JSON.parse(data);
      const userIndex = commandHistory.history.findIndex(item => item.userId === userId);

      if (userIndex !== -1) {
        
      } else {
        commandHistory.history.push({userId: userId, commands: [commandName]});
      }
    });

    await interaction.reply("Pong!");

  } else if (commandName === "chatgpt") {
    // get the option
    const question = await interaction.options.get("prompt")?.value;
    const user = await interaction.user;
    const userId = user.id;
    await interaction.deferReply();
    
    fs.readFile("history.json", "utf8", async function (err, data) {
      if (err) throw err;
      const commandHistory = JSON.parse(data);
      const userIndex = commandHistory.findIndex(item => item.userId === userId);
      const userData = commandHistory[userIndex];

      if (userIndex !== -1) {
        const completion = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [...userData.commands, {role: "user", content: question as string}]
        });
    
        await interaction.followUp({
          content: `${question} by ${user} : \n\n${completion.data.choices[0].message.content}`,
        });

        commandHistory[userIndex].commands.push({
          role: "user",
          content: question as string
        });
      } else {
        const completion = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [
            {role: "user", content: question as string},
        ]
        });
    
        await interaction.followUp({
          content: `${question} by ${user} : \n\n${completion.data.choices[0].message.content}`,
        });

        commandHistory.push({userId: userId, commands: [
          {
            role: "user",
            content: question as string
          }
        ]});
      }

      fs.writeFile('history.json', JSON.stringify(commandHistory), (err) => {
        if (err) throw err;
        console.log('Command history saved to JSON file');
      });
    });
  }
});

client.login(TOKEN);
