import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { StateMessage } from "./StateMessage";

const meta = {
  title: "UI/StateMessage",
  component: StateMessage,
  tags: ["autodocs"],
  args: {
    children: "Данные успешно загружены.",
  },
} satisfies Meta<typeof StateMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Success: Story = { args: { tone: "success" } };
export const Error: Story = {
  args: {
    tone: "error",
    children: "Не удалось получить результат. Попробуйте ещё раз.",
  },
};
