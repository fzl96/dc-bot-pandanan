import {
  REST,
  Routes,
  IntentsBitField,
  Client,
  ApplicationCommandOptionType,
} from "discord.js";
import { Configuration, OpenAIApi } from "openai";
import type { ChatCompletionRequestMessage } from "openai";
import dotenv from "dotenv";
import fs from "fs";
import textToSpeech from "@google-cloud/text-to-speech";
import util from "util";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN; 
const CLIENT_ID = process.env.CLIENT_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

const client = new Client({
  intents: [IntentsBitField.Flags.Guilds, IntentsBitField.Flags.GuildMessages, IntentsBitField.Flags.MessageContent],
});

const textToSpeechClient = new textToSpeech.TextToSpeechClient({
  projectId: process.env.GOOGLE_PROJECT_ID,
  credentials: {
    private_key: process.env.GOOGLE_PRIVATE_KEY.split(String.raw`\n`).join('\n'),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
  },
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

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== CHANNEL_ID) return;
  if (message.content.startsWith("!")) return;

  let conversationLog: any = [{
    role: "system", 
    content: "You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully!"
  }];

  await message.channel.sendTyping();

  let prevMessages = await message.channel.messages.fetch({ limit: 15 });

  prevMessages.reverse().forEach((msg) => {
    if (msg.content.startsWith("!")) return;
    if (msg.author.id !== client.user.id && message.author.bot) return;
    if (msg.author.id !== message.author.id) return;

    conversationLog.push({
      role: "user",
      content: msg.content,
    });
  });

  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: conversationLog,
  });

  message.reply(completion.data.choices[0].message.content);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === "ping") {
    const user = await interaction.user;
    await interaction.reply("Pong!");

  } else if (commandName === "chatgpt") {
    // get the option
    const question = await interaction.options.get("prompt")?.value;
    const user = await interaction.user;
    const userId = user.id;
    await interaction.deferReply();

    try {

      fs.readFile("history.json", "utf8", async function (err, data) {
        if (err) throw err;
        const commandHistory = JSON.parse(data);
        const userIndex = commandHistory.findIndex(item => item.userId === userId);
        const userData = commandHistory[userIndex];
  
        if (userIndex !== -1) {
          const newMessage = {role: "user", content: question as string};
          const messages = [...userData.commands, newMessage];
  
          const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [...messages]
          });
  
          const request: any = {
            input: {text: completion.data.choices[0].message.content},
            voice: {languageCode: "en-US", ssmlGender: "FEMALE", name: "en-US-Neural2-C"},
            audioConfig: {audioEncoding: "MP3"},
          };
          
          const id = uuidv4();
          const outputName = `output-${id}.mp3`;
          const [response] = await textToSpeechClient.synthesizeSpeech(request);
          const writeFile = util.promisify(fs.writeFile);
          await writeFile(outputName, response.audioContent, 'binary');
  
          // send the audio file
          await interaction.followUp({
            files: [outputName],
            content: `${question} by ${user} : \n\n${completion.data.choices[0].message.content}`,
          });
  
          // commandHistory[userIndex].commands.push(newMessage, );
          // push new message and completion message to user's commands 
          commandHistory[userIndex].commands = [...messages, {
            role: "assistant",
            content: completion.data.choices[0].message.content
          }];
  
          fs.unlink(outputName, (err) => {
            if (err) throw err;
            console.log('Audio file deleted');
          });
        } else {
          const messages: ChatCompletionRequestMessage[] = [
            {
              role: "system", 
              content: "You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully!"
            },
            {role: "user", content: question as string},
          ]
  
          const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [...messages]
          });
  
          const request: any = {
            input: {text: completion.data.choices[0].message.content},
            voice: {languageCode: "en-US", ssmlGender: "FEMALE", name: "en-US-Neural2-C"},
            audioConfig: {audioEncoding: "MP3"},
          };
          
          const id = uuidv4();
          const outputName = `output-${id}.mp3`;
          const [response] = await textToSpeechClient.synthesizeSpeech(request);
          const writeFile = util.promisify(fs.writeFile);
          await writeFile(outputName, response.audioContent, 'binary');
  
          // send the audio file
          await interaction.followUp({
            files: [outputName],
            content: `${question} by ${user} : \n\n${completion.data.choices[0].message.content}`,
          });
    
          commandHistory.push({userId: userId, commands: [
            ...messages,
            {
              role: "assistant",
              content: completion.data.choices[0].message.content
            }
          ]});
  
          fs.unlink(outputName, (err) => {
            if (err) throw err;
            console.log('Audio file deleted');
          });
        }
  
        fs.writeFile('history.json', JSON.stringify(commandHistory), (err) => {
          if (err) throw err;
          console.log('Command history saved to JSON file');
        });
      });
    } catch (error) {
      console.error(error);
      await interaction.followUp({ content: "There was an error while executing this command!", ephemeral: true });
    }
  }
});

client.login(TOKEN);
