const dotenv = require("dotenv");
dotenv.config();

const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS);

const fs = require("fs");

const { Client, Intents } = require("discord.js");

const intents = new Intents();
intents.add(Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILDS);

const client = new Client({ intents });

const commands = {};
const commandFiles = fs
  .readdirSync("./src/commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands[command.data.name] = command;
}

client.once("ready", async () => {
  const data = [];
  for (const commandName in commands) {
    data.push(commands[commandName].data);
  }
  await client.application.commands.set(data);
});

const updateMember = async (interaction) => {
  const message = interaction.message;
  const embed = message.embeds[0];
  if (!embed) {
    return;
  }

  const yyyymmdd = interaction.component.customId;

  const config = JSON.parse(await redis.get(interaction.channelId));
  if (!config) {
    interaction.reply("This channel is not registered.");
    return;
  }

  const participants = config[yyyymmdd]?.participants;
  if (!participants) {
    interaction.reply("This schedule is done.");
    return;
  }

  const join = !participants.includes(interaction.user.id);

  const replaced = join
    ? participants.some((p) => p === interaction.user.id)
      ? participants
      : [...participants, interaction.user.id]
    : participants.filter((p) => p !== interaction.user.id);

  const result = await redis.set(
    interaction.channelId,
    JSON.stringify({
      ...config,
      [yyyymmdd]: {
        participants: replaced,
      },
    })
  );

  if (result !== "OK") {
    interaction.reply("Erorr");
    return;
  }

  const day = new Date(
    yyyymmdd.substring(0, 4),
    parseInt(yyyymmdd.substring(4, 6)) - 1,
    yyyymmdd.substring(6, 8)
  ).getDay();

  const field = embed.fields[day];
  field.name = `${field.name.split(" - ")[0]} - ${replaced.length}人`;
  if (replaced.length === 0) {
    field.value = "> -";
  } else {
    field.value = replaced.map((p) => `> <@${p}>`).join("\n");
  }

  if (config.created) {
    const thread = interaction.channel.threads.cache.get(
      config.created.threadId
    );
    const message = thread?.messages.cache.get(config.created.messageId);
    await message?.edit(
      replaced.length === 0
        ? "参加者なし"
        : replaced.map((p) => `<@${p}>`).join(" ")
    );
  }

  return interaction.update({
    embeds: [embed],
  });
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) {
    await updateMember(interaction);
    return;
  }

  const command = commands[interaction.commandName];
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

client.login(process.env.TOKEN);
