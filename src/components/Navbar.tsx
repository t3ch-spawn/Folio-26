import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText } from "gsap/all";
import { useRef } from "react";
import { HashLink } from "react-router-hash-link";

gsap.registerPlugin(SplitText);

export default function Navbar() {
  return (
    <nav className="flex gap-[20px] fixed top-[40px] right-[40px] 768:top-[20px] 768:right-[20px] body-sm z-[100] bg-gray-300/20 px-[16px] py-[12px] rounded-sm">
      <NavLink name="About" url="/#about" />
      <NavLink name="Works" url="/#works" />
      <NavLink name="Contact" url="/#contact" />
    </nav>
  );
}

gsap.registerPlugin(useGSAP, SplitText);

function NavLink({
  name,
  url,
  linkStyle = "",
}: {
  name: string;
  url: string;
  linkStyle?: string;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  const { contextSafe } = useGSAP({ scope: linkRef });

  useGSAP(
    () => {
      const link = linkRef.current;
      if (!link) return;

      const paragraphs = link.querySelectorAll("p");
      const split1 = SplitText.create(paragraphs[0], { type: "chars" });
      const split2 = SplitText.create(paragraphs[1], { type: "chars" });
      const chars = [...split1.chars, ...split2.chars];

      gsap.set(chars, { yPercent: 0 });

      const animate = contextSafe((yPercent: number) => {
        [split1.chars, split2.chars].forEach((targets) => {
          gsap.to(targets, {
            yPercent,
            stagger: 0.045,
            duration: 0.45,
            ease: "back.out(2.3)",
            overwrite: "auto",
          });
        });
      });

      const handleMouseEnter = () => animate(-100);
      const handleMouseLeave = () => animate(0);

      link.addEventListener("mouseenter", handleMouseEnter);
      link.addEventListener("mouseleave", handleMouseLeave);

      return () => {
        link.removeEventListener("mouseenter", handleMouseEnter);
        link.removeEventListener("mouseleave", handleMouseLeave);
        gsap.killTweensOf(chars);
        split1.revert();
        split2.revert();
      };
    },
    { scope: linkRef, dependencies: [name], revertOnUpdate: true },
  );

  return (
    <HashLink
      smooth
      to={url}
      ref={linkRef}
      className={`${linkStyle} relative block overflow-hidden`}
    >
      <p>{name}</p>
      <p aria-hidden="true" className="absolute top-full left-0">
        {name}
      </p>
    </HashLink>
  );
}
