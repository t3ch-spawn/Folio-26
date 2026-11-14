import type { ReactElement } from "react";
import { FaGithub } from "react-icons/fa";
import { CiMail } from "react-icons/ci";
import { FaXTwitter } from "react-icons/fa6";
import { FaLinkedin } from "react-icons/fa6";

const socials: { icon: ReactElement; link: string }[] = [
  { icon: <FaGithub />, link: "https://github.com/t3ch-spawn" },
  { icon: <CiMail />, link: "mailto:boluwatife1904@gmail.com" },
  { icon: <FaXTwitter />, link: "https://x.com/t3ch_spawn" },
  {
    icon: <FaLinkedin />,
    link: "https://www.linkedin.com/in/boluwatife-olusanya-12594025b/",
  },
];

export default function Contact() {
  return (
    <section id="contact" className="mt-[370px] 1024:mt-[300px] flex flex-col pb-[300px] px-[16px] scroll-mt-20">
      <div className="flex flex-col justify-center items-center">
        <h2 className="text-5xl 1024:text-[2.7rem] font-bold mx-auto uppercase">Get In Touch.</h2>
        <p className="mt-[15px] text-xl 1024:text-lg leading-[110%] max-w-[550px] text-center">
          Open for creative development projects, interactive experiences and
          collaborations
        </p>
      </div>

      {/* Container for socials */}
      <div className="mt-[40px] flex justify-center items-center gap-[30px]">
        {socials.map(({ icon, link }) => {
          return (
            <a className="text-[40px] 650:text-[35px]" href={link}>
              {icon}
            </a>
          );
        })}
      </div>
    </section>
  );
}
